import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const transaction = (index) => ({
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
  accountId: 'checking', transactionId: `tx-${index}`,
  amountCents: -100, currency: 'USD', postedDate: '2026-10-29',
  status: 'posted', providerReference: `ref-${index}`,
});
const review = (transactions) => proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });

test('read-only transfer review accepts the exact bounded 1000-row batch', () => {
  const transactions = Array.from({ length: 1000 }, (_, i) => transaction(i));
  const result = review(transactions);
  assert.deepEqual(result, { candidates: [], ambiguous: [] });
  assert.equal(transactions.length, 1000);
});

test('transfer review rejects 1001 records before processing evidence', () => {
  const transactions = Array.from({ length: 1001 }, (_, i) => transaction(i));
  assert.throws(() => review(transactions), /Invalid authorized transfer scope or batch/);
});

test('transfer review rejects extra array properties and noncanonical array indexes', () => {
  const extra = [transaction(0)];
  extra.metadata = 'untrusted';
  assert.throws(() => review(extra), /Malformed transfer transaction batch/);
  const noncanonical = [transaction(0)];
  noncanonical['01'] = transaction(1);
  assert.throws(() => review(noncanonical), /Malformed transfer transaction batch/);
});

test('transfer review rejects accessor array elements without invoking getter', () => {
  const transactions = [transaction(0)];
  let called = false;
  Object.defineProperty(transactions, '0', {
    enumerable: true, configurable: true,
    get() { called = true; throw new Error('getter executed'); },
  });
  assert.throws(() => review(transactions), /Malformed transfer transaction batch/);
  assert.equal(called, false);
});

test('transfer review rejects sparse arrays and array proxies without invoking traps', () => {
  const sparse = Array(2);
  sparse[0] = transaction(0);
  assert.throws(() => review(sparse), /Malformed transfer transaction batch/);

  let trapCalled = false;
  const proxy = new Proxy([transaction(0)], {
    get() { trapCalled = true; throw new Error('proxy trap executed'); },
    ownKeys() { trapCalled = true; throw new Error('proxy trap executed'); },
  });
  assert.throws(() => review(proxy), /Invalid authorized transfer scope or batch/);
  assert.equal(trapCalled, false);
});

test('transfer review rejects accessor length-independent metadata and symbol properties', () => {
  const symbolBatch = [transaction(0)];
  symbolBatch[Symbol('hidden')] = 'untrusted';
  assert.throws(() => review(symbolBatch), /Malformed transfer transaction batch/);

  const accessorBatch = [transaction(0)];
  let called = false;
  Object.defineProperty(accessorBatch, 'metadata', {
    enumerable: true, configurable: true,
    get() { called = true; throw new Error('metadata getter executed'); },
  });
  assert.throws(() => review(accessorBatch), /Malformed transfer transaction batch/);
  assert.equal(called, false);
});


test('transfer review rejects hidden record fields and executable record metadata without evaluating accessors', () => {
  const hidden = transaction(0);
  Object.defineProperty(hidden, 'internalApproval', {
    value: true, enumerable: false, configurable: true,
  });
  assert.throws(() => review([hidden]), /Invalid transfer source record/);

  const symbolRecord = transaction(1);
  symbolRecord[Symbol('approval')] = true;
  assert.throws(() => review([symbolRecord]), /Invalid transfer source record/);

  let getterCalls = 0;
  const accessorRecord = transaction(2);
  Object.defineProperty(accessorRecord, 'providerReference', {
    enumerable: true, configurable: true,
    get() { getterCalls++; throw new Error('untrusted provider getter executed'); },
  });
  assert.throws(() => review([accessorRecord]), /Invalid transfer source record/);
  assert.equal(getterCalls, 0);

  // Untrusted prototype-pollution keys must not be accepted as banking metadata.
  const polluted = transaction(3);
  Object.defineProperty(polluted, '__proto__', {
    value: { approved: true }, enumerable: true, configurable: true,
  });
  assert.throws(() => review([polluted]), /Invalid transfer source record/);
  assert.deepEqual(review([transaction(4)]), { candidates: [], ambiguous: [] });
});

test('pending provider-reference collision prevents automatic transfer suggestion', () => {
  const debit = { ...transaction(1), accountId: 'checking', amountCents: -100, providerReference: 'shared' };
  const credit = { ...transaction(2), accountId: 'savings', amountCents: 100, providerReference: 'shared' };
  const pending = { ...transaction(3), accountId: 'reserve', amountCents: 100, status: 'pending', providerReference: 'shared' };
  const result = review([debit, credit, pending]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous.map((item) => item.transactionId).sort(), ['tx-1', 'tx-2']);
});

test('removed provider-reference collision does not invalidate a current posted pair', () => {
  const debit = { ...transaction(1), accountId: 'checking', amountCents: -100, providerReference: 'shared' };
  const credit = { ...transaction(2), accountId: 'savings', amountCents: 100, providerReference: 'shared' };
  const removed = { ...transaction(3), accountId: 'reserve', amountCents: 100, status: 'removed', providerReference: 'shared' };
  const result = review([debit, credit, removed]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});

test('transfer review never pairs identical references across provider connections or providers', () => {
  const debit = { ...transaction(10), accountId: 'checking', providerReference: 'batch-1' };
  const otherConnection = { ...transaction(11), accountId: 'savings', connectionId: 'item-b', amountCents: 100, providerReference: 'batch-1' };
  const otherProvider = { ...transaction(12), accountId: 'savings', provider: 'mercury', amountCents: 100, providerReference: 'batch-1' };
  assert.deepEqual(review([debit, otherConnection, otherProvider]), { candidates: [], ambiguous: [] });
});

test('read-only candidate output is deterministic under feed replay ordering', () => {
  const debit = { ...transaction(20), accountId: 'checking', amountCents: -500, providerReference: 'transfer-20' };
  const credit = { ...transaction(21), accountId: 'savings', amountCents: 500, providerReference: 'transfer-20' };
  const unrelated = { ...transaction(22), accountId: 'checking', providerReference: 'unrelated' };
  const first = review([debit, credit, unrelated]);
  assert.equal(first.candidates.length, 1);
  assert.equal(first.candidates[0].status, 'review_required');
  assert.deepEqual(review([unrelated, credit, debit]), first);
});


test('provider transaction identity cannot be reused across accounts within one connection', () => {
  const debit = { ...transaction(40), accountId: 'checking', amountCents: -250, providerReference: 'move-40' };
  const forgedCredit = { ...transaction(40), accountId: 'savings', amountCents: 250, providerReference: 'move-40' };
  assert.throws(() => review([debit, forgedCredit]), /Duplicate provider transaction identity across accounts/);
  // A different connection may independently issue the same transaction ID.
  const independent = { ...forgedCredit, connectionId: 'item-b' };
  assert.deepEqual(review([debit, independent]), { candidates: [], ambiguous: [] });
});


test('shared batch reference with two debits and two credits never yields a transfer candidate', () => {
  const rows = [
    { ...transaction(50), accountId: 'checking', amountCents: -300, providerReference: 'batch-50' },
    { ...transaction(51), accountId: 'payroll', amountCents: -300, providerReference: 'batch-50' },
    { ...transaction(52), accountId: 'savings', amountCents: 300, providerReference: 'batch-50' },
    { ...transaction(53), accountId: 'reserve', amountCents: 300, providerReference: 'batch-50' },
  ];
  const result = review(rows);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous.map((row) => row.transactionId).sort(),
    ['tx-50', 'tx-51', 'tx-52', 'tx-53']);
  assert.deepEqual(review([...rows].reverse()), result);
});


test('transfer date window is inclusive at three UTC calendar days and excludes day four', () => {
  const debit = { ...transaction(60), accountId: 'checking', amountCents: -700,
    postedDate: '2026-10-29', providerReference: 'window-60' };
  const dayThree = { ...transaction(61), accountId: 'savings', amountCents: 700,
    postedDate: '2026-11-01', providerReference: 'window-60' };
  const dayFour = { ...dayThree, postedDate: '2026-11-02' };
  const inside = review([debit, dayThree]);
  assert.equal(inside.candidates.length, 1);
  assert.equal(inside.candidates[0].dayGap, 3);
  assert.equal(inside.candidates[0].status, 'review_required');
  assert.deepEqual(review([debit, dayFour]), { candidates: [], ambiguous: [] });
});

test('transfer review rejects impossible posting dates rather than normalizing them', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '0000-01-01']) {
    assert.throws(() => review([{ ...transaction(70), postedDate: date }]),
      /Invalid transfer posting date/, date);
  }
  assert.deepEqual(review([{ ...transaction(71), postedDate: '2024-02-29' }]),
    { candidates: [], ambiguous: [] });
});

test('transfer review fails closed on cross-tenant rows even when references and amounts match', () => {
  const debit = { ...transaction(80), accountId: 'checking', amountCents: -500,
    providerReference: 'same-reference' };
  const foreignCredit = { ...transaction(81), tenantId: 'tenant-b', accountId: 'savings',
    amountCents: 500, providerReference: 'same-reference' };
  assert.throws(() => review([debit, foreignCredit]),
    /Invalid or unauthorized transfer source record/);
  assert.throws(() => review([foreignCredit, debit]),
    /Invalid or unauthorized transfer source record/);
  const authorizedCredit = { ...foreignCredit, tenantId: 'tenant-a' };
  const result = review([debit, authorizedCredit]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
});

test('transfer review rejects executable tenant scope without evaluating accessors', () => {
  let invoked = false;
  const scope = { transactions: [transaction(82)] };
  Object.defineProperty(scope, 'tenantId', {
    enumerable: true,
    get() { invoked = true; throw new Error('scope getter invoked'); },
  });
  assert.throws(() => proposeBankTransferCandidates(scope),
    /Invalid authorized transfer scope or batch/);
  assert.equal(invoked, false);
});


test('pending evidence alone cannot create a transfer or silently hide reference collisions', () => {
  const posted = { ...transaction(90), accountId: 'checking', amountCents: -900,
    providerReference: 'pending-batch-90' };
  const pendingA = { ...transaction(91), accountId: 'savings', amountCents: 900,
    status: 'pending', providerReference: 'pending-batch-90' };
  const pendingB = { ...transaction(92), accountId: 'reserve', amountCents: 900,
    status: 'pending', providerReference: 'pending-batch-90' };
  const result = review([posted, pendingA, pendingB]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous, [{ provider: 'plaid', connectionId: 'item-a',
    accountId: 'checking', transactionId: 'tx-90', candidateCount: 0 }]);
  assert.deepEqual(review([pendingB, posted, pendingA]), result);
  assert.deepEqual(review([pendingA, pendingB]), { candidates: [], ambiguous: [] });
});


test('replayed provider transaction cannot appear as both pending and posted in one review batch', () => {
  const pending = { ...transaction(100), status: 'pending', accountId: 'checking',
    amountCents: -450, providerReference: 'transition-100' };
  const posted = { ...pending, status: 'posted' };
  const counterpart = { ...transaction(101), accountId: 'savings',
    amountCents: 450, providerReference: 'transition-100' };
  for (const batch of [
    [pending, posted, counterpart],
    [counterpart, posted, pending],
  ]) {
    assert.throws(() => review(batch), /Duplicate transfer source identity/);
  }
  // A caller must canonicalize pending-to-posted updates before transfer review.
  const clean = review([posted, counterpart]);
  assert.equal(clean.candidates.length, 1);
  assert.equal(clean.candidates[0].status, 'review_required');
});


test('pending collision evidence is scoped to its own provider connection', () => {
  const debit = { ...transaction(110), accountId: 'checking', amountCents: -600,
    providerReference: 'shared-110' };
  const credit = { ...transaction(111), accountId: 'savings', amountCents: 600,
    providerReference: 'shared-110' };
  const unrelatedPending = { ...transaction(112), connectionId: 'item-b',
    accountId: 'reserve', amountCents: 600, status: 'pending',
    providerReference: 'shared-110' };
  const result = review([debit, credit, unrelatedPending]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(review([unrelatedPending, credit, debit]), result);
});

test('pending collision evidence in same connection blocks posted pair across currencies', () => {
  const debit = { ...transaction(120), accountId: 'checking', amountCents: -600,
    providerReference: 'shared-120' };
  const credit = { ...transaction(121), accountId: 'savings', amountCents: 600,
    providerReference: 'shared-120' };
  const pending = { ...transaction(122), accountId: 'reserve', amountCents: 600,
    currency: 'EUR', status: 'pending', providerReference: 'shared-120' };
  const result = review([debit, credit, pending]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous.map((row) => row.transactionId).sort(),
    ['tx-120', 'tx-121']);
});

test('one pending reference collision marks posted evidence ambiguous without proposing a transfer', () => {
  const posted = { ...transaction(130), accountId: 'checking',
    providerReference: 'transition-130' };
  const pending = { ...transaction(131), accountId: 'savings',
    amountCents: 100, status: 'pending', providerReference: 'transition-130' };
  const expected = { candidates: [], ambiguous: [{
    provider: 'plaid', connectionId: 'item-a', accountId: 'checking',
    transactionId: 'tx-130', candidateCount: 0,
  }] };
  assert.deepEqual(review([posted, pending]), expected);
  assert.deepEqual(review([pending, posted]), expected);
  assert.deepEqual(review([posted]), { candidates: [], ambiguous: [] });
});

test('pending reference collisions from another provider do not poison an authorized transfer pair', () => {
  const debit = { ...transaction(140), accountId: 'checking', amountCents: -725,
    providerReference: 'shared-cross-provider-140' };
  const credit = { ...transaction(141), accountId: 'savings', amountCents: 725,
    providerReference: 'shared-cross-provider-140' };
  const foreignPending = { ...transaction(142), provider: 'mercury',
    accountId: 'reserve', amountCents: 725, status: 'pending',
    providerReference: 'shared-cross-provider-140' };
  const result = review([debit, credit, foreignPending]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].provider, 'plaid');
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(review([foreignPending, credit, debit]), result);
});


test('identical transfer references in independent providers produce separate review candidates', () => {
  const plaidDebit = { ...transaction(150), accountId: 'checking', amountCents: -825,
    providerReference: 'shared-provider-reference-150' };
  const plaidCredit = { ...transaction(151), accountId: 'savings', amountCents: 825,
    providerReference: 'shared-provider-reference-150' };
  const mercuryDebit = { ...transaction(152), provider: 'mercury', connectionId: 'mercury-a',
    accountId: 'operating', amountCents: -825, providerReference: 'shared-provider-reference-150' };
  const mercuryCredit = { ...transaction(153), provider: 'mercury', connectionId: 'mercury-a',
    accountId: 'reserve', amountCents: 825, providerReference: 'shared-provider-reference-150' };
  const rows = [plaidDebit, mercuryCredit, plaidCredit, mercuryDebit];
  const result = review(rows);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map((candidate) => candidate.provider).sort(), ['mercury', 'plaid']);
  assert.ok(result.candidates.every((candidate) => candidate.status === 'review_required'));
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(review([...rows].reverse()), result);
});

test('same-account debit and credit cannot masquerade as an internal account transfer', () => {
  const debit = { ...transaction(160), accountId: 'checking', amountCents: -900,
    providerReference: 'same-account-160' };
  const credit = { ...transaction(161), accountId: 'checking', amountCents: 900,
    providerReference: 'same-account-160' };
  assert.deepEqual(review([debit, credit]), { candidates: [], ambiguous: [] });
  assert.deepEqual(review([credit, debit]), { candidates: [], ambiguous: [] });

  const distinctAccountCredit = { ...credit, accountId: 'savings' };
  const result = review([debit, distinctAccountCredit]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});

test('same reference and amount cannot pair across currencies or calendar windows', () => {
  const debit = { ...transaction(170), accountId: 'checking', amountCents: -1250,
    postedDate: '2026-10-30', providerReference: 'boundary-170' };
  const foreignCurrency = { ...transaction(171), accountId: 'savings', amountCents: 1250,
    currency: 'EUR', postedDate: '2026-10-31', providerReference: 'boundary-170' };
  const lateCredit = { ...foreignCurrency, currency: 'USD', postedDate: '2026-11-03' };
  assert.deepEqual(review([debit, foreignCurrency]), { candidates: [], ambiguous: [] });
  assert.deepEqual(review([foreignCurrency, debit]), { candidates: [], ambiguous: [] });
  assert.deepEqual(review([debit, lateCredit]), { candidates: [], ambiguous: [] });
  const eligible = { ...lateCredit, postedDate: '2026-11-02' };
  const result = review([debit, eligible]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].dayGap, 3);
  assert.equal(result.candidates[0].status, 'review_required');
});


test('provider identity cannot be replayed across removed, pending, and posted lifecycle rows', () => {
  const posted = { ...transaction(180), accountId: 'checking', amountCents: -420,
    providerReference: 'lifecycle-180' };
  const removed = { ...posted, status: 'removed' };
  const pending = { ...posted, status: 'pending' };
  const credit = { ...transaction(181), accountId: 'savings', amountCents: 420,
    providerReference: 'lifecycle-180' };
  for (const stale of [removed, pending]) {
    assert.throws(() => review([stale, posted, credit]), /Duplicate transfer source identity/);
    assert.throws(() => review([credit, posted, stale]), /Duplicate transfer source identity/);
  }
  const canonical = review([posted, credit]);
  assert.equal(canonical.candidates.length, 1);
  assert.equal(canonical.candidates[0].status, 'review_required');
  assert.deepEqual(canonical.ambiguous, []);
});

test('retired lifecycle evidence cannot poison a posted transfer reference', () => {
  const debit = { ...transaction(190), accountId: 'checking', amountCents: -950,
    providerReference: 'retired-190' };
  const credit = { ...transaction(191), accountId: 'savings', amountCents: 950,
    providerReference: 'retired-190' };
  const removed = { ...transaction(192), accountId: 'archive', status: 'removed',
    providerReference: 'retired-190' };
  const superseded = { ...transaction(193), accountId: 'old-savings', status: 'superseded',
    providerReference: 'retired-190' };
  const rows = [debit, removed, credit, superseded];
  const result = review(rows);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(review([...rows].reverse()), result);
  const pending = { ...transaction(194), accountId: 'archive-pending', status: 'pending',
    providerReference: 'retired-190' };
  const blocked = review([...rows, pending]);
  assert.deepEqual(blocked.candidates, []);
  assert.deepEqual(blocked.ambiguous.map((row) => row.transactionId).sort(),
    ['tx-190', 'tx-191']);
});


test('foreign-tenant pending evidence cannot suppress authorized transfer review', () => {
  const debit = { ...transaction(200), accountId: 'checking', amountCents: -125,
    providerReference: 'tenant-pending-200' };
  const credit = { ...transaction(201), accountId: 'savings', amountCents: 125,
    providerReference: 'tenant-pending-200' };
  const foreignPending = { ...transaction(202), tenantId: 'tenant-b',
    accountId: 'reserve', amountCents: 125, status: 'pending',
    providerReference: 'tenant-pending-200' };
  for (const rows of [
    [debit, credit, foreignPending],
    [foreignPending, credit, debit],
  ]) {
    assert.throws(() => review(rows), /Invalid or unauthorized transfer source record/);
  }
  const result = review([debit, credit]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});

test('one credit competing with two debits is never offered as an approved transfer', () => {
  const debitA = { ...transaction(210), accountId: 'checking', amountCents: -350,
    providerReference: 'many-to-one-210' };
  const debitB = { ...transaction(211), accountId: 'payroll', amountCents: -350,
    providerReference: 'many-to-one-210' };
  const credit = { ...transaction(212), accountId: 'savings', amountCents: 350,
    providerReference: 'many-to-one-210' };
  const rows = [debitA, credit, debitB];
  const result = review(rows);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous.map((row) => row.transactionId).sort(),
    ['tx-210', 'tx-211', 'tx-212']);
  assert.ok(result.ambiguous.every((row) => row.candidateCount >= 1));
  assert.deepEqual(review([...rows].reverse()), result);
});
