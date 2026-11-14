import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

const scope = {
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
  allowedAccountIds: ['account-a'],
};

test('duplicate scoped checkpoint rows fail closed before replay or writes', async () => {
  const queries = [];
  let released = 0;
  const checkpoint = {
    tenant_id: 'tenant-a', provider: 'plaid', connection_id: 'item-a',
    cursor: null, revision: '0',
  };
  const pool = {
    async connect() {
      return {
        async query(sql) {
          queries.push(sql);
          if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('FOR UPDATE')) {
            return { rows: [{ ...checkpoint }, { ...checkpoint }], rowCount: 2 };
          }
          throw new Error('Unexpected SQL after duplicate checkpoint');
        },
        release() { released++; },
      };
    },
  };
  const store = createBankFeedPostgresStore(pool);
  await assert.rejects(
    store.withTransaction((tx) => tx.loadCheckpointForUpdate(scope)),
    /Multiple persisted banking checkpoints/,
  );
  assert.equal(queries.length, 3);
  assert.equal(queries[0], 'BEGIN');
  assert.match(queries[1], /FOR UPDATE/);
  assert.equal(queries[2], 'ROLLBACK');
  assert.equal(released, 1);
});

test('absent scoped checkpoint still returns null', async () => {
  const queries = [];
  const pool = {
    async connect() {
      return {
        async query(sql) {
          queries.push(sql);
          if (sql.includes('FOR UPDATE')) return { rows: [], rowCount: 0 };
          return { rows: [] };
        },
        release() {},
      };
    },
  };
  const result = await createBankFeedPostgresStore(pool).withTransaction(
    (tx) => tx.loadCheckpointForUpdate(scope),
  );
  assert.equal(result, null);
  assert.equal(queries.at(-1), 'COMMIT');
});
