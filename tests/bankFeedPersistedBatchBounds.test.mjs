import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

const scope = {
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
  allowedAccountIds: ['account-a'],
};

function poolForRows(rows, statements) {
  return {
    async connect() {
      return {
        async query(sql) {
          statements.push(sql);
          if (sql.includes('FROM public.clearflow_bank_feed_entries')) return { rows };
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
          throw new Error('Unexpected SQL statement');
        },
        release() {},
      };
    },
  };
}

function persistedRows(count, memoBytes) {
  const memo = 'x'.repeat(memoBytes);
  return Array.from({ length: count }, (_, index) => {
    const transactionId = 'tx-' + index;
    return {
      tenant_id: scope.tenantId, provider: scope.provider,
      connection_id: scope.connectionId, account_id: 'account-a',
      transaction_id: transactionId,
      payload: {
        tenantId: scope.tenantId, provider: scope.provider,
        connectionId: scope.connectionId, accountId: 'account-a',
        transactionId, memo,
      },
    };
  });
}

test('aggregate oversized persisted feed evidence fails closed with rollback', async () => {
  const statements = [];
  // Each entry is below the 1 MiB individual limit; together they exceed 16 MiB.
  const store = createBankFeedPostgresStore(poolForRows(persistedRows(18, 950_000), statements));
  await assert.rejects(
    store.withTransaction((tx) => tx.loadEntries(scope)),
    /Oversized persisted banking entry batch evidence/,
  );
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.includes('COMMIT'), false);
});

test('bounded persisted feed evidence remains readable', async () => {
  const statements = [];
  const store = createBankFeedPostgresStore(poolForRows(persistedRows(2, 100), statements));
  const result = await store.withTransaction((tx) => tx.loadEntries(scope));
  assert.deepEqual(result.map((entry) => entry.transactionId), ['tx-0', 'tx-1']);
  assert.equal(statements.at(-1), 'COMMIT');
});
