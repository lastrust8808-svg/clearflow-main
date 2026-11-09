import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, overrides = {}) => ({
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
  accountId, transactionId, amountCents,
  currency: 'USD', postedDate: '2026-10-29', status: 'posted',
  providerReference: 'internal-transfer-001', ...overrides,
});
const plan = (transactions, tenantId = 'tenant-a') =>
  proposeBankTransferCandidates({ tenantId, transactions });

test('proposes exactly one review-only, reference-backed opposite-sign transfer', () => {
  const input = [row('checking', 'out', -12500),
    row('savings', 'in', 12500, { postedDate: '2026-10-31' })];
  const before = structuredClone(input);
  const result = plan(input);
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(result.candidates, [{
    provider: 'plaid', connectionId: 'item-a',
    left: { accountId: 'checking', transactionId: 'out' },
    right: { accountId: 'savings', transactionId: 'in' },
    amountCents: 12500, currency: 'USD', providerReference: 'internal-transfer-001',
    dayGap: 2, status: 'review_required',
  }]);
  assert.deepEqual(input, before);
});

test('never guesses a transfer from equal amounts without a shared reference', () => {
  assert.deepEqual(plan([
    row('checking', 'out', -500, { providerReference: undefined }),
    row('savings', 'in', 500, { providerReference: undefined }),
  ]).candidates, []);
  assert.deepEqual(plan([
    row('checking', 'out', -500),
    row('savings', 'in', 500, { providerReference: 'unrelated' }),
  ]).candidates, []);
});

test('excludes pending, removed and superseded transactions', () => {
  for (const status of ['pending', 'removed', 'superseded']) {
    assert.deepEqual(plan([
      row('checking', 'out', -500, { status }),
      row('savings', 'in', 500),
    ]).candidates, []);
  }
});

test('rejects same account, currency mismatch, wrong sign and out-of-window matches', () => {
  const out = row('checking', 'out', -500);
  const variants = [
    row('checking', 'in', 500),
    row('savings', 'in', 500, { currency: 'CAD' }),
    row('savings', 'in', -500),
    row('savings', 'in', 500, { postedDate: '2026-11-03' }),
  ];
  for (const variant of variants) {
    assert.deepEqual(plan([out, variant]).candidates, []);
  }
});

test('ambiguous many-to-one evidence is never proposed as a pair', () => {
  const result = plan([
    row('checking', 'out', -500),
    row('savings', 'in1', 500),
    row('reserve', 'in2', 500),
  ]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous, [
    { provider: 'plaid', connectionId: 'item-a', accountId: 'checking', transactionId: 'out', candidateCount: 2 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'reserve', transactionId: 'in2', candidateCount: 1 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'savings', transactionId: 'in1', candidateCount: 1 },
  ]);
});

test('every source in a many-to-one collision is reported for manual review', () => {
  const result = plan([
    row('checking', 'out1', -700),
    row('reserve', 'out2', -700),
    row('savings', 'in', 700),
  ]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous, [
    { provider: 'plaid', connectionId: 'item-a', accountId: 'checking', transactionId: 'out1', candidateCount: 1 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'reserve', transactionId: 'out2', candidateCount: 1 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'savings', transactionId: 'in', candidateCount: 2 },
  ]);
});

test('distinct reference-backed transfers do not collapse equal-value payments', () => {
  const result = plan([
    row('checking', 'out1', -500, { providerReference: 'ref1' }),
    row('savings', 'in1', 500, { providerReference: 'ref1' }),
    row('checking', 'out2', -500, { providerReference: 'ref2' }),
    row('savings', 'in2', 500, { providerReference: 'ref2' }),
  ]);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.ambiguous, []);
});

test('cross-tenant, duplicate and malformed source identities fail closed', () => {
  assert.throws(() => plan([row('checking', 'a', -500, { tenantId: 'other' })]), /unauthorized/);
  assert.throws(() => plan([row('checking', 'a', -500), row('checking', 'a', 500)]), /Duplicate/);
  assert.throws(() => plan([row('checking', 'a', 0)]), /unauthorized/);
  assert.throws(() => plan([row('checking', 'a', -500, { currency: 'usd' })]), /unauthorized/);
  assert.throws(() => plan([row('checking', 'a', -500, { postedDate: '2026-02-30' })]), /date/);
  assert.throws(() => plan([row('checking', 'a', -500, { amountCents: 12.5 })]), /unauthorized/);
});

test('accessors, sparse arrays and Proxy evidence cannot enter matching', () => {
  const accessor = row('checking', 'a', -500);
  Object.defineProperty(accessor, 'amountCents', { get() { throw new Error('executed getter'); }, enumerable: true });
  assert.throws(() => plan([accessor]), /Invalid transfer source/);
  assert.throws(() => plan(new Array(1)), /Malformed transfer transaction batch/);
  assert.throws(() => plan([new Proxy(row('checking', 'a', -500), {})]), /Invalid transfer source/);
});

test('identical references cannot match across provider or connection namespaces', () => {
  const debit = row('checking', 'out', -12500);
  for (const incoming of [
    row('savings', 'in', 12500, { provider: 'mercury' }),
    row('savings', 'in', 12500, { connectionId: 'item-b' }),
  ]) {
    assert.deepEqual(plan([debit, incoming]), { candidates: [], ambiguous: [] });
  }
  assert.equal(plan([debit, row('savings', 'in', 12500)]).candidates.length, 1);
});

test('provider and connection are required canonical source identities', () => {
  for (const overrides of [
    { provider: undefined }, { provider: 'other' }, { provider: 'PLAID' },
    { connectionId: undefined }, { connectionId: '' },
    { connectionId: ' item-a' }, { connectionId: 'item-a\n' },
  ]) {
    assert.throws(
      () => plan([row('checking', 'out', -500, overrides)]),
      /Invalid or unauthorized transfer source record/,
    );
  }
  // The same account and transaction ID in a different provider connection
  // is not a duplicate canonical banking transaction and cannot be paired.
  const result = plan([
    row('checking', 'tx-1', -500),
    row('checking', 'tx-1', 500, { connectionId: 'item-b' }),
  ]);
  assert.deepEqual(result, { candidates: [], ambiguous: [] });
});


test('candidate and ambiguity review queues are deterministic across bank-feed replay ordering', () => {
  const transactions = [
    row('checking', 'out1', -500, { providerReference: 'ref-1' }),
    row('savings', 'in1', 500, { providerReference: 'ref-1' }),
    row('payroll', 'out2', -800, { providerReference: 'ref-2' }),
    row('reserve', 'in2', 800, { providerReference: 'ref-2' }),
    row('holding', 'out3', -900, { providerReference: 'ref-3' }),
    row('wallet', 'in3', 900, { providerReference: 'ref-3' }),
    row('vault', 'in4', 900, { providerReference: 'ref-3' }),
  ];
  const expected = plan(transactions);
  assert.equal(expected.candidates.length, 2);
  assert.equal(expected.ambiguous.length, 3);
  assert.deepEqual(plan([...transactions].reverse()), expected);
  assert.deepEqual(plan([transactions[6], transactions[3], transactions[1], transactions[4],
    transactions[0], transactions[5], transactions[2]]), expected);
});


test('reused batch reference cannot certify two otherwise independent transfer pairs', () => {
  const transactions = [
    row('checking', 'debit-1', -500, { providerReference: 'shared-batch' }),
    row('savings', 'credit-1', 500, { providerReference: 'shared-batch' }),
    row('payroll', 'debit-2', -800, { providerReference: 'shared-batch' }),
    row('reserve', 'credit-2', 800, { providerReference: 'shared-batch' }),
  ];
  const result = plan(transactions);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous, [
    { provider: 'plaid', connectionId: 'item-a', accountId: 'checking', transactionId: 'debit-1', candidateCount: 1 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'payroll', transactionId: 'debit-2', candidateCount: 1 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'reserve', transactionId: 'credit-2', candidateCount: 1 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'savings', transactionId: 'credit-1', candidateCount: 1 },
  ]);
  assert.deepEqual(plan([...transactions].reverse()), result);
});

test('unmatched posted record sharing a reused reference also enters manual review', () => {
  const result = plan([
    row('checking', 'debit', -500, { providerReference: 'batch-123' }),
    row('savings', 'credit', 500, { providerReference: 'batch-123' }),
    row('reserve', 'other', 175, { providerReference: 'batch-123' }),
  ]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous, [
    { provider: 'plaid', connectionId: 'item-a', accountId: 'checking', transactionId: 'debit', candidateCount: 1 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'reserve', transactionId: 'other', candidateCount: 0 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'savings', transactionId: 'credit', candidateCount: 1 },
  ]);
});

test('pending source sharing a provider reference quarantines an otherwise valid posted pair', () => {
  const posted = [
    row('checking', 'debit', -500, { providerReference: 'reused-reference' }),
    row('savings', 'credit', 500, { providerReference: 'reused-reference' }),
  ];
  const pending = row('reserve', 'pending-third', 125, {
    providerReference: 'reused-reference', status: 'pending',
  });
  const expected = {
    candidates: [],
    ambiguous: [
      { provider: 'plaid', connectionId: 'item-a', accountId: 'checking', transactionId: 'debit', candidateCount: 1 },
      { provider: 'plaid', connectionId: 'item-a', accountId: 'savings', transactionId: 'credit', candidateCount: 1 },
    ],
  };
  assert.deepEqual(plan([...posted, pending]), expected);
  assert.deepEqual(plan([pending, ...posted].reverse()), expected);
  // Once the extra evidence is removed or superseded, it no longer blocks
  // review-only matching of the two current posted records.
  for (const status of ['removed', 'superseded']) {
    const result = plan([...posted, { ...pending, status }]);
    assert.equal(result.candidates.length, 1);
    assert.deepEqual(result.ambiguous, []);
  }
});


test('provider transaction ID reuse across accounts fails closed before transfer review', () => {
  // A duplicated provider event must not become a fabricated internal transfer
  // merely because the feed assigned the same transaction ID to two accounts.
  assert.throws(() => plan([
    row('checking', 'same-provider-id', -2500),
    row('savings', 'same-provider-id', 2500),
  ]), /Duplicate provider transaction identity/);
  // Independent provider connections and providers have separate namespaces.
  assert.deepEqual(plan([
    row('checking', 'same-provider-id', -2500),
    row('savings', 'same-provider-id', 2500, { connectionId: 'item-b' }),
    row('reserve', 'same-provider-id', 2500, { provider: 'mercury' }),
  ]), { candidates: [], ambiguous: [] });
  // Distinct source IDs with a shared verified reference remain review-only.
  assert.equal(plan([
    row('checking', 'debit-id', -2500),
    row('savings', 'credit-id', 2500),
  ]).candidates.length, 1);
});


test('noncanonical Unicode source identifiers fail closed before transfer matching', () => {
  const decomposed = 'café';
  const composed = 'café';
  for (const field of ['tenantId', 'connectionId', 'accountId', 'transactionId', 'providerReference']) {
    const invalid = row('checking', 'out', -500, { [field]: decomposed });
    assert.throws(() => plan([invalid], field === 'tenantId' ? decomposed : 'tenant-a'),
      /Invalid authorized transfer scope|Invalid or unauthorized transfer source record/);
    const valid = row('checking', 'out', -500, { [field]: composed });
    assert.doesNotThrow(() => plan([valid], field === 'tenantId' ? composed : 'tenant-a'));
  }
});


test('Unicode line and paragraph separators cannot enter bank source identities', () => {
  for (const separator of ['\u2028', '\u2029']) {
    for (const field of ['tenantId', 'connectionId', 'accountId', 'transactionId', 'providerReference']) {
      const invalid = row('checking', 'out', -500, { [field]: 'segment' + separator + 'suffix' });
      assert.throws(() => plan([invalid], field === 'tenantId' ? invalid.tenantId : 'tenant-a'),
        /Invalid authorized transfer scope|Invalid or unauthorized transfer source record/);
    }
  }
  assert.equal(plan([row('checking', 'out', -500), row('savings', 'in', 500)]).candidates.length, 1);
});


test('Unicode noncharacters cannot enter provider-scoped banking identities', () => {
  for (const noncharacter of [0xFDD0, 0xFDEF, 0xFFFE, 0xFFFF, 0x1FFFE, 0x10FFFF].map((codePoint) => String.fromCodePoint(codePoint))) {
    for (const field of ['tenantId', 'connectionId', 'accountId', 'transactionId', 'providerReference']) {
      const invalid = row('checking', 'out', -500, { [field]: 'id' + noncharacter });
      assert.throws(() => plan([invalid], field === 'tenantId' ? invalid.tenantId : 'tenant-a'),
        /Invalid authorized transfer scope|Invalid or unauthorized transfer source record/);
    }
  }
  assert.equal(plan([row('checking', 'out', -500), row('savings', 'in', 500)]).candidates.length, 1);
});


test('transfer candidates reject unsafe, fractional and signed-zero cent amounts', () => {
  for (const amountCents of [Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1,
    0.5, -0.5, Number.POSITIVE_INFINITY, Number.NaN, -0, 0]) {
    assert.throws(() => plan([row('checking', 'out', amountCents)]),
      /Invalid or unauthorized transfer source record/);
  }
  const max = Number.MAX_SAFE_INTEGER;
  const result = plan([
    row('checking', 'out', -max),
    row('savings', 'in', max),
  ]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].amountCents, max);
  assert.equal(result.candidates[0].status, 'review_required');
});

test('transfer review uses inclusive three-day UTC calendar boundaries across leap day', () => {
  const debit = row('checking', 'leap-out', -1250, {
    postedDate: '2028-02-28', providerReference: 'leap-ref',
  });
  const within = row('savings', 'leap-in', 1250, {
    postedDate: '2028-03-02', providerReference: 'leap-ref',
  });
  const outside = row('savings', 'late-in', 1250, {
    postedDate: '2028-03-03', providerReference: 'leap-ref',
  });
  assert.equal(plan([debit, within]).candidates.length, 1);
  assert.deepEqual(plan([debit, outside]), { candidates: [], ambiguous: [] });
  assert.throws(() => plan([row('checking', 'invalid-leap', -1250, {
    postedDate: '2027-02-29',
  })]), /Invalid transfer posting date/);
});


test('transfer review never pairs cross-currency, same-account or cross-connection records', () => {
  const debit = row('checking', 'out-isolated', -1250, {
    postedDate: '2028-02-29', providerReference: 'isolated-ref',
  });
  const cases = [
    row('checking', 'same-account', 1250, { postedDate: '2028-02-29', providerReference: 'isolated-ref' }),
    row('savings', 'other-currency', 1250, { postedDate: '2028-02-29', providerReference: 'isolated-ref', currency: 'EUR' }),
    row('savings', 'other-connection', 1250, { postedDate: '2028-02-29', providerReference: 'isolated-ref', connectionId: 'item-b' }),
    row('savings', 'other-provider', 1250, { postedDate: '2028-02-29', providerReference: 'isolated-ref', provider: 'mercury' }),
  ];
  for (const credit of cases) {
    assert.deepEqual(plan([debit, credit]), { candidates: [], ambiguous: [] });
    assert.deepEqual(plan([credit, debit]), { candidates: [], ambiguous: [] });
  }
});


test('pending and removed duplicate provider IDs cannot masquerade as independent transfers', () => {
  const debit = row('checking', 'provider-event-1', -875, {
    providerReference: 'shared-ref',
  });
  const credit = row('savings', 'provider-event-2', 875, {
    providerReference: 'shared-ref',
  });
  for (const status of ['pending', 'removed', 'superseded', 'posted']) {
    const duplicate = row('reserve', 'provider-event-1', 875, {
      status, providerReference: 'other-ref',
    });
    assert.throws(() => plan([debit, credit, duplicate]),
      /Duplicate provider transaction identity across accounts/);
    assert.throws(() => plan([duplicate, credit, debit]),
      /Duplicate provider transaction identity across accounts/);
  }
  // An unrelated provider connection is a distinct transaction namespace.
  const independent = row('reserve', 'provider-event-1', 875, {
    connectionId: 'item-b', providerReference: 'other-ref',
  });
  const result = plan([debit, credit, independent]);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.ambiguous, []);
});

test('transfer review rejects impossible century leap dates and accepts valid Gregorian century leap days', () => {
  for (const postedDate of ['1900-02-29', '2100-02-29', '2028-02-30', '2028-04-31', '2028-13-01']) {
    assert.throws(() => plan([row('checking', 'bad-date', -100, { postedDate })]),
      /Invalid transfer posting date/);
  }
  const result = plan([
    row('checking', 'century-debit', -100, { postedDate: '2000-02-29', providerReference: 'century-ref' }),
    row('savings', 'century-credit', 100, { postedDate: '2000-03-01', providerReference: 'century-ref' }),
  ]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].dayGap, 1);
  assert.equal(result.candidates[0].status, 'review_required');
});

test('transfer review scope rejects executable accessors and proxies without evaluating them', () => {
  let getterCalls = 0;
  const debit = row('checking', 'scope-debit', -500);
  const ordinary = { tenantId: 'tenant-a', transactions: [debit] };
  for (const field of ['tenantId', 'transactions']) {
    const scope = { ...ordinary };
    Object.defineProperty(scope, field, {
      enumerable: true,
      get() { getterCalls++; throw new Error('scope getter executed'); },
    });
    assert.throws(() => proposeBankTransferCandidates(scope),
      /Invalid authorized transfer scope or batch/);
  }
  assert.equal(getterCalls, 0);
  assert.throws(() => proposeBankTransferCandidates(new Proxy(ordinary, {
    get() { throw new Error('proxy trap executed'); },
  })), /Invalid authorized transfer scope or batch/);
  for (const scope of [
    Object.assign(Object.create(null), ordinary, { extra: true }),
    { tenantId: 'tenant-a' },
    [ordinary],
    null,
  ]) {
    assert.throws(() => proposeBankTransferCandidates(scope),
      /Invalid authorized transfer scope or batch/);
  }
  assert.deepEqual(proposeBankTransferCandidates(ordinary),
    { candidates: [], ambiguous: [] });
});

test('non-ASCII spacing cannot create visually ambiguous provider identities', () => {
  for (const space of ['\u00a0', '\u1680', '\u2007', '\u202f', '\u205f', '\u3000']) {
    for (const field of ['tenantId', 'connectionId', 'accountId', 'transactionId', 'providerReference']) {
      const invalid = row('checking', 'out', -500, { [field]: 'part' + space + 'two' });
      assert.throws(() => plan([invalid], field === 'tenantId' ? invalid.tenantId : 'tenant-a'),
        /Invalid authorized transfer scope|Invalid or unauthorized transfer source record/);
    }
  }
  // ASCII spaces within references remain valid, and do not authorize posting.
  const result = plan([
    row('checking', 'out', -500, { providerReference: 'reference with spaces' }),
    row('savings', 'in', 500, { providerReference: 'reference with spaces' }),
  ]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
});


test('rejects whitespace-only tenant and provider identity keys before review', () => {
  for (const tenantId of [' ', '   ']) {
    assert.throws(() => plan([], tenantId), /Invalid authorized transfer scope/);
  }
  for (const field of ['connectionId', 'accountId', 'transactionId', 'providerReference']) {
    assert.throws(() => plan([row('checking', 'out', -500, { [field]: '   ' })]),
      /Invalid or unauthorized transfer source record/);
  }
  assert.equal(plan([row('checking', 'out', -500, { providerReference: 'ref 1' })]).candidates.length, 0);
});


test('provider transaction replay under the same account cannot certify a transfer', () => {
  const debit = row('checking', 'replayed-id', -900);
  const credit = row('savings', 'distinct-credit', 900);
  for (const status of ['posted', 'pending', 'removed', 'superseded']) {
    const replay = row('checking', 'replayed-id', -900, { status });
    assert.throws(() => plan([debit, credit, replay]), /Duplicate transfer source identity/);
    assert.throws(() => plan([replay, credit, debit]), /Duplicate transfer source identity/);
  }
  // Replay rejection must not prevent independent, uniquely identified events.
  assert.equal(plan([debit, credit]).candidates.length, 1);
});

test('transaction batches reject hidden, symbol-keyed and accessor entries without invoking getters', () => {
  const valid = row('checking', 'ordinary', -500);
  let getterCalls = 0;
  const hidden = [valid];
  Object.defineProperty(hidden, '0', { value: valid, enumerable: false });
  const symbolKeyed = [valid];
  symbolKeyed[Symbol('unexpected-evidence')] = valid;
  const accessor = [valid];
  Object.defineProperty(accessor, '0', {
    enumerable: true, configurable: true,
    get() { getterCalls++; throw new Error('transaction getter executed'); },
  });
  for (const batch of [hidden, symbolKeyed, accessor]) {
    assert.throws(() => plan(batch), /Malformed transfer transaction batch/);
  }
  assert.equal(getterCalls, 0);
  assert.deepEqual(plan([valid]), { candidates: [], ambiguous: [] });
});


test('transfer source records reject inherited, hidden and symbol-keyed financial evidence', () => {
  let getterCalls = 0;
  const ordinary = row('checking', 'safe-debit', -500);
  const inherited = Object.assign(Object.create({ providerReference: 'hidden-reference' }), ordinary);
  delete inherited.providerReference;
  const hidden = { ...ordinary };
  Object.defineProperty(hidden, 'unreviewedAmount', { value: 999999 });
  const symbolic = { ...ordinary, [Symbol('unreviewed')]: 999999 };
  const getter = { ...ordinary };
  Object.defineProperty(getter, 'providerReference', {
    enumerable: true,
    get() { getterCalls++; throw new Error('source getter executed'); },
  });
  for (const source of [inherited, hidden, symbolic, getter]) {
    assert.throws(() => plan([source]), /Invalid transfer source record/);
  }
  assert.equal(getterCalls, 0);
  const frozen = Object.freeze({ ...ordinary });
  const nullPrototype = Object.assign(Object.create(null), row('savings', 'safe-credit', 500));
  const result = plan(Object.freeze([frozen, nullPrototype]));
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
});


test('transfer review uses calendar days across DST transitions and year boundaries', () => {
  // Wall-clock DST shifts must not change the three-calendar-day matching gate.
  for (const [debitDate, acceptedDate, rejectedDate] of [
    ['2026-03-07', '2026-03-10', '2026-03-11'],
    ['2026-10-31', '2026-11-03', '2026-11-04'],
    ['2026-12-30', '2027-01-02', '2027-01-03'],
  ]) {
    const debit = row('checking', 'out-' + debitDate, -1234, { postedDate: debitDate });
    const accepted = row('savings', 'in-' + acceptedDate, 1234, { postedDate: acceptedDate });
    const rejected = row('savings', 'in-' + rejectedDate, 1234, { postedDate: rejectedDate });
    const matched = plan([debit, accepted]);
    assert.equal(matched.candidates.length, 1, debitDate);
    assert.equal(matched.candidates[0].dayGap, 3, debitDate);
    assert.equal(matched.candidates[0].status, 'review_required');
    assert.deepEqual(plan([debit, rejected]), { candidates: [], ambiguous: [] }, debitDate);
    assert.deepEqual(plan([accepted, debit]), matched, debitDate);
  }
});
