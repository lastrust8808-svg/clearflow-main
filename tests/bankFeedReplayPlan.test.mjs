import test from 'node:test';
import assert from 'node:assert/strict';
import { planBankFeedReplay } from '../src/services/bankFeedReplayPlan.service.ts';

const base = () => ({ tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', allowedAccountIds: ['acct-a', 'acct-b'], existing: [], events: [] });
const event = (transactionId, overrides = {}) => ({ kind: 'added', accountId: 'acct-a', transactionId, amountCents: 2575, pending: false, ...overrides });

test('same event replay does not create another canonical transaction', () => {
  const first = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  const second = planBankFeedReplay({ ...base(), existing: first.entries, events: [event('tx-1')] });
  assert.equal(first.applied, 1);
  assert.equal(second.applied, 0);
  assert.equal(second.replayed, 1);
  assert.deepEqual(second.entries, first.entries);
});

test('distinct provider transaction IDs with the same amount remain distinct', () => {
  const result = planBankFeedReplay({ ...base(), events: [event('tx-1'), event('tx-2')] });
  assert.equal(result.entries.length, 2);
  assert.equal(result.applied, 2);
});

test('identical provider transaction IDs on different accounts remain distinct', () => {
  const result = planBankFeedReplay({ ...base(), events: [event('tx-1'), event('tx-1', { accountId: 'acct-b' })] });
  assert.equal(result.entries.length, 2);
});

test('explicit pending-to-posted link supersedes pending without posting twice', () => {
  const pending = planBankFeedReplay({ ...base(), events: [event('pending-1', { pending: true })] });
  const posted = planBankFeedReplay({ ...base(), existing: pending.entries, events: [event('posted-1', { pendingTransactionId: 'pending-1' })] });
  assert.deepEqual(posted.entries.map(({ status }) => status), ['superseded', 'posted']);
  assert.equal(posted.entries[0].supersededBy, 'posted-1');
  const replay = planBankFeedReplay({ ...base(), existing: posted.entries, events: [event('posted-1', { pendingTransactionId: 'pending-1' })] });
  assert.equal(replay.replayed, 1);
  assert.deepEqual(replay.entries, posted.entries);
});

test('pending linkage cannot cross account boundaries or refer to unknown IDs', () => {
  const pending = planBankFeedReplay({ ...base(), events: [event('pending-1', { pending: true })] });
  for (const accountId of ['acct-b', 'acct-a']) {
    assert.throws(() => planBankFeedReplay({ ...base(), existing: pending.entries, events: [event('posted-1', { accountId, pendingTransactionId: accountId === 'acct-b' ? 'pending-1' : 'unknown' })] }), /linkage is missing/);
  }
});

test('conflicting duplicate replay fails closed without changing input', () => {
  const first = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  const snapshot = structuredClone(first.entries);
  assert.throws(() => planBankFeedReplay({ ...base(), existing: first.entries, events: [event('tx-1', { amountCents: 3000 })] }), /Conflicting replay/);
  assert.deepEqual(first.entries, snapshot);
});

test('batch error never partially mutates source records', () => {
  const first = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  const snapshot = structuredClone(first.entries);
  assert.throws(() => planBankFeedReplay({ ...base(), existing: first.entries, events: [event('tx-2'), event('bad', { accountId: 'foreign' })] }), /unauthorized/);
  assert.deepEqual(first.entries, snapshot);
});

test('unauthorized tenant or account records are rejected before replay', () => {
  const first = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  for (const override of [{ tenantId: 'tenant-b' }, { accountId: 'foreign' }, { connectionId: 'item-b' }]) {
    assert.throws(() => planBankFeedReplay({ ...base(), existing: [{ ...first.entries[0], ...override }] }), /outside the authorized scope/);
  }
});

test('unsafe amounts, malformed identities and unknown modifications fail closed', () => {
  for (const amountCents of [0.1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '25']) {
    assert.throws(() => planBankFeedReplay({ ...base(), events: [event('tx-1', { amountCents })] }), /safe integer/);
  }
  assert.throws(() => planBankFeedReplay({ ...base(), events: [event('bad\u202eid')] }), /invalid or unauthorized/);
  assert.throws(() => planBankFeedReplay({ ...base(), events: [event('tx-1', { kind: 'modified' })] }), /Unknown modification/);
});

test('negative-zero cents are rejected in new events and stored feed evidence', () => {
  // JSON.stringify(-0) produces "0"; accepting it would silently change the
  // original financial evidence during persistence or a replay.
  const original = planBankFeedReplay({
    ...base(), events: [event('tx-1', { amountCents: 0 })],
  });
  assert.equal(original.entries[0].amountCents, 0, 'ordinary positive zero is valid');
  const snapshot = structuredClone(original.entries);
  assert.throws(() => planBankFeedReplay({
    ...base(), existing: original.entries,
    events: [event('tx-2', { amountCents: -0 })],
  }), /safe integer/);
  assert.deepEqual(original.entries, snapshot);

  const corrupted = structuredClone(original.entries);
  corrupted[0].amountCents = -0;
  assert.throws(() => planBankFeedReplay({
    ...base(), existing: corrupted, events: [],
  }), /safe integer/);

  // A rejected later event must not partially mutate the caller's records.
  assert.throws(() => planBankFeedReplay({
    ...base(), existing: original.entries,
    events: [event('tx-2', { amountCents: 100 }), event('tx-3', { amountCents: -0 })],
  }), /safe integer/);
  assert.deepEqual(original.entries, snapshot);
});

test('modifications and removals require explicit review; removal replays safely', () => {
  const first = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  const modified = planBankFeedReplay({ ...base(), existing: first.entries, events: [event('tx-1', { kind: 'modified', amountCents: 2600 })] });
  assert.equal(modified.entries[0].amountCents, 2600);
  assert.equal(modified.entries[0].requiresReview, true);
  const removed = planBankFeedReplay({ ...base(), existing: modified.entries, events: [{ kind: 'removed', accountId: 'acct-a', transactionId: 'tx-1' }] });
  assert.equal(removed.entries[0].status, 'removed');
  const replay = planBankFeedReplay({ ...base(), existing: removed.entries, events: [{ kind: 'removed', accountId: 'acct-a', transactionId: 'tx-1' }] });
  assert.equal(replay.replayed, 1);
  assert.throws(() => planBankFeedReplay({ ...base(), existing: removed.entries, events: [event('tx-1')] }), /resurrection/);
});

test('duplicate existing canonical keys are rejected before import', () => {
  const first = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  assert.throws(() => planBankFeedReplay({ ...base(), existing: [first.entries[0], first.entries[0]] }), /Duplicate canonical/);
});

test('modified posted record retains a valid pending supersession link', () => {
  const pending = planBankFeedReplay({ ...base(), events: [event('pending-1', { pending: true })] });
  const posted = planBankFeedReplay({ ...base(), existing: pending.entries, events: [event('posted-1', { pendingTransactionId: 'pending-1' })] });
  const changed = planBankFeedReplay({ ...base(), existing: posted.entries, events: [event('posted-1', { kind: 'modified', amountCents: 2600, pendingTransactionId: 'pending-1' })] });
  assert.equal(changed.entries[0].status, 'superseded');
  assert.equal(changed.entries[1].amountCents, 2600);
  assert.equal(changed.entries[1].requiresReview, true);
});

test('posted feed state never regresses to pending through a modification', () => {
  const first = planBankFeedReplay({ ...base(), events: [event('posted-1')] });
  const snapshot = structuredClone(first.entries);
  assert.throws(() => planBankFeedReplay({
    ...base(), existing: first.entries,
    events: [event('posted-1', { kind: 'modified', pending: true })],
  }), /cannot regress to pending/);
  assert.deepEqual(first.entries, snapshot);
});

test('posted pending-to-posted linkage is immutable without audited correction', () => {
  const pending = planBankFeedReplay({
    ...base(), events: [
      event('pending-1', { pending: true }),
      event('pending-2', { pending: true }),
    ],
  });
  const posted = planBankFeedReplay({
    ...base(), existing: pending.entries,
    events: [event('posted-1', { pendingTransactionId: 'pending-1' })],
  });
  const snapshot = structuredClone(posted.entries);
  for (const pendingTransactionId of [null, 'pending-2']) {
    assert.throws(() => planBankFeedReplay({
      ...base(), existing: posted.entries,
      events: [event('posted-1', { kind: 'modified', pendingTransactionId, amountCents: 2600 })],
    }), /pending linkage cannot change/);
    assert.deepEqual(posted.entries, snapshot);
  }
  const valid = planBankFeedReplay({
    ...base(), existing: posted.entries,
    events: [event('posted-1', { kind: 'modified', pendingTransactionId: 'pending-1', amountCents: 2600 })],
  });
  assert.equal(valid.entries.find((row) => row.transactionId === 'posted-1').amountCents, 2600);
  assert.equal(valid.entries.find((row) => row.transactionId === 'pending-1').supersededBy, 'posted-1');
});

test('provider removal of a superseded pending row preserves posted correction linkage', () => {
  const pending = planBankFeedReplay({
    ...base(), events: [event('pending-1', { pending: true })],
  });
  const posted = planBankFeedReplay({
    ...base(), existing: pending.entries,
    events: [event('posted-1', { pendingTransactionId: 'pending-1' })],
  });
  const removal = { kind: 'removed', accountId: 'acct-a', transactionId: 'pending-1' };
  const removed = planBankFeedReplay({
    ...base(), existing: posted.entries, events: [removal],
  });
  assert.equal(removed.applied, 0);
  assert.equal(removed.replayed, 1);
  assert.deepEqual(removed.entries, posted.entries);
  const replay = planBankFeedReplay({
    ...base(), existing: removed.entries, events: [removal],
  });
  assert.equal(replay.replayed, 1);
  assert.deepEqual(replay.entries, posted.entries);
  const correction = planBankFeedReplay({
    ...base(), existing: removed.entries,
    events: [event('posted-1', {
      kind: 'modified', amountCents: 2600, pendingTransactionId: 'pending-1',
    })],
  });
  assert.equal(correction.entries.find((row) => row.transactionId === 'pending-1').status, 'superseded');
  assert.equal(correction.entries.find((row) => row.transactionId === 'posted-1').amountCents, 2600);
});

test('removing a pending row without posted linkage still records removal', () => {
  const pending = planBankFeedReplay({
    ...base(), events: [event('pending-1', { pending: true })],
  });
  const removed = planBankFeedReplay({
    ...base(), existing: pending.entries,
    events: [{ kind: 'removed', accountId: 'acct-a', transactionId: 'pending-1' }],
  });
  assert.equal(removed.applied, 1);
  assert.equal(removed.entries[0].status, 'removed');
  assert.equal(removed.entries[0].requiresReview, true);
});

test('persisted feed metadata rejects malformed or forged supersession evidence', () => {
  const pending = planBankFeedReplay({ ...base(), events: [event('pending-1', { pending: true })] });
  const posted = planBankFeedReplay({
    ...base(), existing: pending.entries,
    events: [event('posted-1', { pendingTransactionId: 'pending-1' })],
  });
  const snapshot = structuredClone(posted.entries);
  const corruptions = [
    (rows) => { rows[0].supersededBy = 'other-posted'; },
    (rows) => { rows[0].supersededBy = ''; },
    (rows) => { rows[0].supersededBy = undefined; },
    (rows) => { rows[1].pendingTransactionId = 'unknown-pending'; },
    (rows) => { rows[1].pendingTransactionId = 'posted-1'; },
    (rows) => { rows[1].requiresReview = 'true'; },
    (rows) => { rows[0].status = 'pending'; },
  ];
  for (const corrupt of corruptions) {
    const rows = structuredClone(snapshot);
    corrupt(rows);
    assert.throws(() => planBankFeedReplay({ ...base(), existing: rows, events: [] }),
      /malformed|linkage is inconsistent/);
  }
  assert.deepEqual(posted.entries, snapshot);
});

test('persisted pending-to-posted links cannot cross account boundaries', () => {
  const pending = planBankFeedReplay({ ...base(), events: [event('pending-1', { pending: true })] });
  const posted = planBankFeedReplay({
    ...base(), existing: pending.entries,
    events: [event('posted-1', { pendingTransactionId: 'pending-1' })],
  });
  const rows = structuredClone(posted.entries);
  rows[1].accountId = 'acct-b';
  assert.throws(() => planBankFeedReplay({ ...base(), existing: rows, events: [] }),
    /linkage is inconsistent/);
});

test('removed posted records retain valid persisted supersession provenance', () => {
  const pending = planBankFeedReplay({ ...base(), events: [event('pending-1', { pending: true })] });
  const posted = planBankFeedReplay({
    ...base(), existing: pending.entries,
    events: [event('posted-1', { pendingTransactionId: 'pending-1' })],
  });
  const removed = planBankFeedReplay({
    ...base(), existing: posted.entries,
    events: [{ kind: 'removed', accountId: 'acct-a', transactionId: 'posted-1' }],
  });
  assert.equal(removed.entries[0].status, 'superseded');
  assert.equal(removed.entries[1].status, 'removed');
  const replay = planBankFeedReplay({ ...base(), existing: removed.entries, events: [] });
  assert.deepEqual(replay.entries, removed.entries);
});

test('repeated identical modified feed events are idempotent after first correction', () => {
  const first = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  const changed = planBankFeedReplay({
    ...base(), existing: first.entries,
    events: [event('tx-1', { kind: 'modified', amountCents: 2600 })],
  });
  assert.equal(changed.applied, 1);
  const replay = planBankFeedReplay({
    ...base(), existing: changed.entries,
    events: [event('tx-1', { kind: 'modified', amountCents: 2600 })],
  });
  assert.equal(replay.applied, 0);
  assert.equal(replay.replayed, 1);
  assert.deepEqual(replay.entries, changed.entries);

  const pending = planBankFeedReplay({
    ...base(), events: [event('pending-1', { pending: true })],
  });
  const repeatedPending = planBankFeedReplay({
    ...base(), existing: pending.entries,
    events: [event('pending-1', { kind: 'modified', pending: true })],
  });
  assert.equal(repeatedPending.applied, 0);
  assert.equal(repeatedPending.replayed, 1);
});

test('first no-op modification still flags an unreviewed record for review', () => {
  const first = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  const unreviewed = first.entries.map((entry) => ({ ...entry, requiresReview: false }));
  const modified = planBankFeedReplay({
    ...base(), existing: unreviewed,
    events: [event('tx-1', { kind: 'modified' })],
  });
  assert.equal(modified.applied, 1);
  assert.equal(modified.replayed, 0);
  assert.equal(modified.entries[0].requiresReview, true);
  assert.equal(unreviewed[0].requiresReview, false);
  const replay = planBankFeedReplay({
    ...base(), existing: modified.entries,
    events: [event('tx-1', { kind: 'modified' })],
  });
  assert.equal(replay.applied, 0);
  assert.equal(replay.replayed, 1);
});

test('stored and incoming feed getters are rejected without evaluating financial fields', () => {
  const original = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  let getterCalls = 0;
  const stored = { ...original.entries[0] };
  Object.defineProperty(stored, 'amountCents', {
    enumerable: true,
    get() { getterCalls++; return 2575; },
  });
  assert.throws(() => planBankFeedReplay({
    ...base(), existing: [stored], events: [],
  }), /malformed canonical feed/);
  assert.equal(getterCalls, 0);

  const incoming = event('tx-2');
  Object.defineProperty(incoming, 'pending', {
    enumerable: true,
    get() { getterCalls++; return false; },
  });
  assert.throws(() => planBankFeedReplay({
    ...base(), existing: original.entries, events: [incoming],
  }), /malformed canonical feed/);
  assert.equal(getterCalls, 0);
  assert.equal(original.entries[0].amountCents, 2575);
});

test('feed arrays reject sparse indices, getter elements and hidden metadata', () => {
  let getterCalls = 0;
  const getterEvents = [event('tx-1')];
  Object.defineProperty(getterEvents, '0', {
    enumerable: true,
    get() { getterCalls++; return event('tx-1'); },
  });
  assert.throws(() => planBankFeedReplay({
    ...base(), events: getterEvents,
  }), /malformed canonical feed/);
  assert.equal(getterCalls, 0);

  const sparseEvents = new Array(2);
  sparseEvents[1] = event('tx-1');
  assert.throws(() => planBankFeedReplay({
    ...base(), events: sparseEvents,
  }), /malformed canonical feed/);

  const decoratedExisting = [];
  Object.defineProperty(decoratedExisting, 'hidden', { value: 'foreign evidence' });
  assert.throws(() => planBankFeedReplay({
    ...base(), existing: decoratedExisting,
  }), /malformed canonical feed/);

  const decoratedAccounts = ['acct-a'];
  decoratedAccounts[Symbol('hidden')] = 'foreign account';
  assert.throws(() => planBankFeedReplay({
    ...base(), allowedAccountIds: decoratedAccounts,
  }), /malformed canonical feed/);
});

test('canonical provider and stored records reject unknown or hidden evidence fields', () => {
  const original = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  const cases = [
    { ...original.entries[0], unexpectedBalance: 1000 },
    Object.assign(Object.create({ inherited: true }), original.entries[0]),
  ];
  for (const stored of cases) {
    assert.throws(() => planBankFeedReplay({
      ...base(), existing: [stored],
    }), /malformed canonical feed/);
  }

  const hidden = event('tx-2');
  Object.defineProperty(hidden, 'providerPayload', { value: 'not persisted' });
  const withSymbol = event('tx-3');
  withSymbol[Symbol('audit')] = 'not persisted';
  const polluted = JSON.parse('{"kind":"added","accountId":"acct-a","transactionId":"tx-4","amountCents":2575,"pending":false,"__proto__":{"isAdmin":true}}');
  for (const incoming of [event('tx-5', { unexpectedBalance: 1000 }), hidden, withSymbol, polluted]) {
    assert.throws(() => planBankFeedReplay({
      ...base(), existing: original.entries, events: [incoming],
    }), /malformed canonical feed/);
  }
  assert.equal(original.entries.length, 1);
});

test('removal events with attached posting or amount evidence fail closed', () => {
  const original = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  const snapshot = structuredClone(original.entries);
  for (const extra of [
    { amountCents: 2575 },
    { pending: false },
    { pendingTransactionId: 'pending-1' },
    { amountCents: undefined },
  ]) {
    assert.throws(() => planBankFeedReplay({
      ...base(), existing: original.entries,
      events: [{ kind: 'removed', accountId: 'acct-a', transactionId: 'tx-1', ...extra }],
    }), /malformed canonical feed/);
    assert.deepEqual(original.entries, snapshot);
  }
  const valid = planBankFeedReplay({
    ...base(), existing: original.entries,
    events: [{ kind: 'removed', accountId: 'acct-a', transactionId: 'tx-1' }],
  });
  assert.equal(valid.entries[0].status, 'removed');
});

test('frozen and null-prototype canonical JSON envelopes remain supported', () => {
  const frozen = Object.freeze(event('tx-1'));
  const nullPrototype = Object.assign(Object.create(null), event('tx-2'));
  const result = planBankFeedReplay({
    ...base(),
    allowedAccountIds: Object.freeze(['acct-a', 'acct-b']),
    events: Object.freeze([frozen, nullPrototype]),
  });
  assert.equal(result.applied, 2);
  assert.deepEqual(result.entries.map((entry) => entry.transactionId), ['tx-1', 'tx-2']);
});


test('canonical input scope cannot execute getters or silently drop hidden fields', () => {
  let getterCalls = 0;
  const withGetter = base();
  Object.defineProperty(withGetter, 'tenantId', {
    enumerable: true,
    get() { getterCalls++; return 'tenant-a'; },
  });
  assert.throws(() => planBankFeedReplay(withGetter), /malformed canonical feed input/);
  assert.equal(getterCalls, 0);

  const hidden = base();
  Object.defineProperty(hidden, 'untrackedAuthorization', { value: 'tenant-b' });
  assert.throws(() => planBankFeedReplay(hidden), /malformed canonical feed input/);

  const incomplete = base();
  delete incomplete.tenantId;
  assert.throws(() => planBankFeedReplay(incomplete), /malformed canonical feed input/);
});

test('provider events require own posting and identity evidence', () => {
  const valid = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  const snapshot = structuredClone(valid.entries);
  for (const field of ['kind', 'accountId', 'transactionId', 'amountCents', 'pending']) {
    const incomplete = event('tx-2');
    delete incomplete[field];
    assert.throws(() => planBankFeedReplay({
      ...base(), existing: valid.entries, events: [incomplete],
    }), /malformed canonical feed provider event/);
    assert.deepEqual(valid.entries, snapshot);
  }

  const removal = { kind: 'removed', accountId: 'acct-a', transactionId: 'tx-1' };
  const validRemoval = planBankFeedReplay({
    ...base(), existing: valid.entries, events: [removal],
  });
  assert.equal(validRemoval.entries[0].status, 'removed');
  for (const field of ['kind', 'accountId', 'transactionId']) {
    const incomplete = { ...removal };
    delete incomplete[field];
    assert.throws(() => planBankFeedReplay({
      ...base(), existing: valid.entries, events: [incomplete],
    }), /malformed canonical feed provider event/);
  }
});

test('stored feed records require own scope, amount, status and review fields', () => {
  const valid = planBankFeedReplay({ ...base(), events: [event('tx-1')] });
  const snapshot = structuredClone(valid.entries);
  for (const field of [
    'tenantId', 'provider', 'connectionId', 'accountId', 'transactionId',
    'amountCents', 'status', 'requiresReview',
  ]) {
    const incomplete = { ...valid.entries[0] };
    delete incomplete[field];
    assert.throws(() => planBankFeedReplay({
      ...base(), existing: [incomplete], events: [],
    }), /malformed canonical feed stored record/);
    assert.deepEqual(valid.entries, snapshot);
  }
});
