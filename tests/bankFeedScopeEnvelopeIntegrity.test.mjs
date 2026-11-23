import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

// Direct adapter callers must not be able to smuggle mutable/accessor account
// authorization through a scope, even if the planner is bypassed.
test('banking adapter rejects non-data account authorization envelopes before scoped SQL', async () => {
  let scopedQueries = 0;
  const store = createBankFeedPostgresStore({
    async connect() {
      return {
        async query(sql) {
          if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: null };
          scopedQueries++;
          throw new Error('scoped SQL must not run');
        },
        release() {},
      };
    },
  });
  const base = { tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', allowedAccountIds: ['acct-a'] };
  const accessorIds = ['acct-a'];
  Object.defineProperty(accessorIds, '0', { enumerable: true, configurable: true, get() { throw new Error('accessor executed'); } });
  const sparseIds = new Array(1);
  const extraIds = ['acct-a'];
  extraIds.extra = 'acct-b';
  const symbolIds = ['acct-a'];
  symbolIds[Symbol('hidden')] = 'acct-b';
  const invalid = [
    { ...base, allowedAccountIds: accessorIds },
    { ...base, allowedAccountIds: sparseIds },
    { ...base, allowedAccountIds: extraIds },
    { ...base, allowedAccountIds: symbolIds },
    { ...base, allowedAccountIds: new Proxy(['acct-a'], {}) },
    Object.assign(Object.create({ tenantId: 'inherited' }), base),
  ];
  for (const scope of invalid) {
    await assert.rejects(
      store.withTransaction(async (tx) => tx.loadCheckpointForUpdate(scope)),
      /Invalid authenticated banking scope/,
    );
  }
  assert.equal(scopedQueries, 0);
});
