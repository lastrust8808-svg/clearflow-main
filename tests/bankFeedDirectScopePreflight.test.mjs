import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

// Authorization must fail before obtaining a database connection. This test
// intentionally uses no PostgreSQL server and cannot initiate a bank transfer.
test('direct banking adapter rejects malformed authorization scopes before connecting', async () => {
  let connections = 0;
  const store = createBankFeedPostgresStore({
    async connect() {
      connections++;
      throw new Error('database must not be contacted');
    },
  });
  const valid = {
    tenantId: 'tenant-a', provider: 'plaid',
    connectionId: 'item-a', allowedAccountIds: ['acct-a'],
  };
  const invalid = [
    { ...valid, tenantId: 'tenant-a\u200b' },
    { ...valid, tenantId: 'tenant-a\ud800' },
    { ...valid, connectionId: ' item-a' },
    { ...valid, provider: 'unknown' },
    { ...valid, allowedAccountIds: ['acct-a', 'acct-a'] },
    { ...valid, allowedAccountIds: ['acct-a', 'acct-a\u200b'] },
    { ...valid, allowedAccountIds: [] },
  ];
  for (const scope of invalid) {
    await assert.rejects(
      store.withTransaction(async (tx) => tx.loadCheckpointForUpdate(scope)),
      /Invalid authenticated banking scope/,
    );
  }
  assert.equal(connections, 0);
});
