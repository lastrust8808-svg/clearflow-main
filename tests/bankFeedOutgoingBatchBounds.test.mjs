import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

const scope = {
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
  allowedAccountIds: ['account-a'],
};

function makePool(statements) {
  return {
    async connect() {
      return {
        async query(sql) {
          statements.push(sql);
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
          if (sql.includes('INSERT INTO public.clearflow_bank_feed_entries')) return { rowCount: 1 };
          throw new Error('Unexpected SQL statement');
        },
        release() {},
      };
    },
  };
}

function entries(count, memoBytes) {
  const memo = 'x'.repeat(memoBytes);
  return Array.from({ length: count }, (_, i) => ({
    tenantId: scope.tenantId, provider: scope.provider,
    connectionId: scope.connectionId, accountId: 'account-a',
    transactionId: 'tx-' + i, memo,
  }));
}

test('aggregate oversized outgoing evidence rejects before any INSERT and rolls back', async () => {
  const statements = [];
  const store = createBankFeedPostgresStore(makePool(statements));
  await assert.rejects(
    store.withTransaction((tx) => tx.saveEntries(scope, entries(18, 950_000))),
    /Refusing oversized banking batch write/,
  );
  assert.deepEqual(statements, ['BEGIN', 'ROLLBACK']);
});

test('bounded outgoing evidence inserts each unique record and commits', async () => {
  const statements = [];
  const store = createBankFeedPostgresStore(makePool(statements));
  await store.withTransaction((tx) => tx.saveEntries(scope, entries(2, 100)));
  assert.equal(statements.filter((sql) => sql.includes('INSERT INTO public.clearflow_bank_feed_entries')).length, 2);
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'COMMIT');
});
