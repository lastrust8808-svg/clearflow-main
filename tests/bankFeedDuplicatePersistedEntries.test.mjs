import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

const scope = {
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
  allowedAccountIds: ['account-a'],
};
const entry = {
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
  accountId: 'account-a', transactionId: 'tx-a',
};
const row = {
  tenant_id: 'tenant-a', provider: 'plaid', connection_id: 'item-a',
  account_id: 'account-a', transaction_id: 'tx-a', payload: entry,
};

function poolForRows(rows, statements) {
  return {
    async connect() {
      return {
        async query(sql) {
          statements.push(sql);
          if (sql.includes('FROM public.clearflow_bank_feed_entries')) return { rows };
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          throw new Error('Unexpected SQL statement');
        },
        release() {},
      };
    },
  };
}

test('duplicate persisted SQL entry identities fail closed and roll back', async () => {
  const statements = [];
  const store = createBankFeedPostgresStore(poolForRows([{ ...row }, { ...row }], statements));
  await assert.rejects(
    store.withTransaction((tx) => tx.loadEntries(scope)),
    /Duplicate persisted banking entry identity/,
  );
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.includes('COMMIT'), false);
});

test('distinct persisted SQL entry identities remain readable', async () => {
  const statements = [];
  const second = {
    ...row, transaction_id: 'tx-b',
    payload: { ...entry, transactionId: 'tx-b' },
  };
  const store = createBankFeedPostgresStore(poolForRows([{ ...row }, second], statements));
  const result = await store.withTransaction((tx) => tx.loadEntries(scope));
  assert.deepEqual(result.map((item) => item.transactionId), ['tx-a', 'tx-b']);
  assert.equal(statements.at(-1), 'COMMIT');
});
