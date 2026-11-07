import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

const scope = { tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', allowedAccountIds: ['account-a'] };
const before = { tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', cursor: 'before', revision: 1 };
const after = { ...before, cursor: 'after', revision: 2 };

function fakePool(result) {
  const statements = [];
  return {
    statements,
    async connect() {
      return {
        async query(sql) {
          statements.push(sql);
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('UPDATE public.clearflow_bank_feed_checkpoints')) return result;
          throw new Error('Unexpected query');
        },
        release() {},
      };
    },
  };
}

test('checkpoint CAS rejects Proxy SQL result without executing traps', async () => {
  let trapCalls = 0;
  const result = new Proxy({ rowCount: 1 }, {
    get() { trapCalls++; throw Error('unexpected getter'); },
    getOwnPropertyDescriptor() { trapCalls++; throw Error('unexpected descriptor'); },
  });
  const pool = fakePool(result);
  await assert.rejects(
    createBankFeedPostgresStore(pool).withTransaction(tx => tx.compareAndSwapCheckpoint(scope, before, after)),
    /Invalid banking checkpoint update result/,
  );
  assert.equal(trapCalls, 0);
  assert.equal(pool.statements.at(-1), 'ROLLBACK');
});

test('checkpoint CAS rejects inherited rowCount even if value is valid', async () => {
  const pool = fakePool(Object.create({ rowCount: 1 }));
  await assert.rejects(
    createBankFeedPostgresStore(pool).withTransaction(tx => tx.compareAndSwapCheckpoint(scope, before, after)),
    /Invalid banking checkpoint update result/,
  );
  assert.equal(pool.statements.at(-1), 'ROLLBACK');
});
