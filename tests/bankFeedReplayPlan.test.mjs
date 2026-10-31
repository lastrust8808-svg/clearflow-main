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
