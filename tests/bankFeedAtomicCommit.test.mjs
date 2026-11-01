import test from 'node:test';
import assert from 'node:assert/strict';
import { commitAuthorizedBankFeedPage } from '../src/services/bankFeedAtomicCommit.service.ts';

const scope = () => ({ tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', allowedAccountIds: ['acct-a'] });
const checkpoint = () => ({ tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', cursor: null, revision: 0 });
const event = (transactionId = 'tx-1') => ({ kind: 'added', accountId: 'acct-a', transactionId, amountCents: 2500, pending: false });
const page = (events = [event()], nextCursor = 'cursor-1') => ({ events, nextCursor, hasMore: false });

function fakeTransactionalStore(options = {}) {
  const state = { checkpoint: checkpoint(), entries: [] };
  const calls = { transactions: 0, rows: 0, cursor: 0, rollbacks: 0 };
  return {
    state, calls,
    async withTransaction(fn) {
      calls.transactions++;
      const pending = structuredClone(state);
      const tx = {
        async loadCheckpointForUpdate() { return structuredClone(pending.checkpoint); },
        async loadEntries() { return structuredClone(pending.entries); },
        async saveEntries(_scope, entries) {
          calls.rows++;
          if (options.failRows) throw new Error('simulated row write failure');
          pending.entries = structuredClone(entries);
        },
        async compareAndSwapCheckpoint(_scope, previous, next) {
          calls.cursor++;
          if (options.failCas || previous.revision !== pending.checkpoint.revision ||
              previous.cursor !== pending.checkpoint.cursor) return false;
          pending.checkpoint = structuredClone(next);
          return true;
        },
      };
      try {
        const result = await fn(tx);
        Object.assign(state, pending);
        return result;
      } catch (error) {
        calls.rollbacks++;
        throw error;
      }
    },
  };
}

test('atomic bank-feed page commits transaction rows and cursor once', async () => {
  const store = fakeTransactionalStore();
  const result = await commitAuthorizedBankFeedPage(store, scope(), page());
  assert.equal(result.applied, 1);
  assert.equal(result.commitRequired, true);
  assert.equal(store.state.entries.length, 1);
  assert.equal(store.state.entries[0].transactionId, 'tx-1');
  assert.deepEqual(store.state.checkpoint, { ...checkpoint(), cursor: 'cursor-1', revision: 1 });
  assert.equal(store.calls.rows, 1);
  assert.equal(store.calls.cursor, 1);
});

test('duplicate identities in a single provider page cannot write rows or advance the cursor', async () => {
  const store = fakeTransactionalStore();
  await assert.rejects(
    commitAuthorizedBankFeedPage(store, scope(), page([event('same'), event('same')])),
    /Duplicate provider event identity within one feed page/,
  );
  assert.deepEqual(store.state, { checkpoint: checkpoint(), entries: [] });
  assert.equal(store.calls.rows, 0);
  assert.equal(store.calls.cursor, 0);
  assert.equal(store.calls.rollbacks, 1);
});

test('row-write failure rolls back cursor and entries', async () => {
  const store = fakeTransactionalStore({ failRows: true });
  await assert.rejects(commitAuthorizedBankFeedPage(store, scope(), page()), /row write failure/);
  assert.deepEqual(store.state, { checkpoint: checkpoint(), entries: [] });
  assert.equal(store.calls.cursor, 0);
  assert.equal(store.calls.rollbacks, 1);
});

test('cursor compare-and-swap failure rolls back already proposed rows', async () => {
  const store = fakeTransactionalStore({ failCas: true });
  await assert.rejects(commitAuthorizedBankFeedPage(store, scope(), page()), /compare-and-swap failed/);
  assert.deepEqual(store.state, { checkpoint: checkpoint(), entries: [] });
  assert.equal(store.calls.rows, 1);
  assert.equal(store.calls.rollbacks, 1);
});

test('unchanged terminal empty poll makes no writes', async () => {
  const store = fakeTransactionalStore();
  const first = await commitAuthorizedBankFeedPage(store, scope(), page([], 'cursor-1'));
  assert.equal(first.commitRequired, true, 'first empty page advances from null cursor');
  const again = await commitAuthorizedBankFeedPage(store, scope(), page([], 'cursor-1'));
  assert.equal(again.commitRequired, false);
  assert.equal(store.calls.rows, 0);
  assert.equal(store.calls.cursor, 1);
  assert.equal(store.state.checkpoint.revision, 1);
});

test('out-of-scope checkpoint or provider event fails before any write', async () => {
  const store = fakeTransactionalStore();
  await assert.rejects(commitAuthorizedBankFeedPage(store, { ...scope(), tenantId: 'tenant-b' }, page()),
    /outside the authorized connection scope/);
  await assert.rejects(commitAuthorizedBankFeedPage(store, scope(), page([{ ...event(), accountId: 'acct-foreign' }])),
    /unauthorized/);
  assert.deepEqual(store.state, { checkpoint: checkpoint(), entries: [] });
  assert.equal(store.calls.rows, 0);
  assert.equal(store.calls.cursor, 0);
});

test('scope, page and event accessors fail before opening a transaction', async () => {
  const store = fakeTransactionalStore();
  let getterCalls = 0;
  const hostileScope = { ...scope() };
  Object.defineProperty(hostileScope, 'tenantId', {
    enumerable: true, get() { getterCalls++; return 'tenant-b'; },
  });
  await assert.rejects(commitAuthorizedBankFeedPage(store, hostileScope, page()),
    /Malformed bank feed scope field/);
  const hostilePage = { ...page() };
  Object.defineProperty(hostilePage, 'events', {
    enumerable: true, get() { getterCalls++; return [event()]; },
  });
  await assert.rejects(commitAuthorizedBankFeedPage(store, scope(), hostilePage),
    /Malformed bank feed page field/);
  const hostileEvent = { ...event() };
  Object.defineProperty(hostileEvent, 'amountCents', {
    enumerable: true, get() { getterCalls++; return 1; },
  });
  await assert.rejects(commitAuthorizedBankFeedPage(store, scope(), page([hostileEvent])),
    /Malformed bank feed event field/);
  assert.equal(getterCalls, 0, 'untrusted accessors must never execute');
  assert.equal(store.calls.transactions, 0);
  assert.deepEqual(store.state, { checkpoint: checkpoint(), entries: [] });
});

test('mutating caller scope and provider page while waiting for checkpoint lock cannot redirect commit', async () => {
  const store = fakeTransactionalStore();
  const mutableScope = scope();
  const mutablePage = page();
  const originalTransaction = store.withTransaction.bind(store);
  store.withTransaction = (operation) => originalTransaction(async (tx) => {
    const originalLoad = tx.loadCheckpointForUpdate;
    tx.loadCheckpointForUpdate = async (lockedScope) => {
      const current = await originalLoad(lockedScope);
      mutableScope.tenantId = 'tenant-foreign';
      mutableScope.allowedAccountIds[0] = 'acct-foreign';
      mutablePage.events[0].accountId = 'acct-foreign';
      mutablePage.events[0].amountCents = 999999;
      mutablePage.nextCursor = 'cursor-forged';
      return current;
    };
    return operation(tx);
  });
  const result = await commitAuthorizedBankFeedPage(store, mutableScope, mutablePage);
  assert.equal(result.applied, 1);
  assert.equal(store.state.entries[0].tenantId, 'tenant-a');
  assert.equal(store.state.entries[0].accountId, 'acct-a');
  assert.equal(store.state.entries[0].amountCents, 2500);
  assert.equal(store.state.checkpoint.cursor, 'cursor-1');
});

test('sparse, accessor-backed or metadata-bearing provider batches fail before transaction', async () => {
  const store = fakeTransactionalStore();
  const sparse = Array(1);
  const extra = Object.assign([event()], { hiddenTransaction: 'discarded' });
  const accessorArray = [event()];
  Object.defineProperty(accessorArray, '0', {
    enumerable: true, get() { throw new Error('unexpected provider getter'); },
  });
  for (const events of [sparse, extra, accessorArray]) {
    await assert.rejects(commitAuthorizedBankFeedPage(store, scope(), page(events)),
      /Malformed bank feed events list/);
  }
  assert.equal(store.calls.transactions, 0);
});
