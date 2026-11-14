import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

const scope = { tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', allowedAccountIds: ['account-a'] };
const previous = { tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', cursor: 'before', revision: 1 };
const next = { ...previous, cursor: 'after', revision: 2 };

function poolFor(result) {
  const queries = [];
  let released = 0;
  return {
    queries,
    get released() { return released; },
    async connect() {
      return {
        async query(sql) {
          queries.push(sql);
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('UPDATE public.clearflow_bank_feed_checkpoints')) return result;
          throw Error('Unexpected query');
        },
        release() { released++; },
      };
    },
  };
}

test('malformed CAS rowCount fails closed and rolls back without invoking accessor', async () => {
  let getterCalls = 0;
  const result = {};
  Object.defineProperty(result, 'rowCount', { enumerable: true, get() { getterCalls++; throw Error('executed'); } });
  const pool = poolFor(result);
  await assert.rejects(
    createBankFeedPostgresStore(pool).withTransaction(tx => tx.compareAndSwapCheckpoint(scope, previous, next)),
    /Invalid banking checkpoint update result/,
  );
  assert.equal(getterCalls, 0);
  assert.equal(pool.queries.at(-1), 'ROLLBACK');
  assert.equal(pool.released, 1);
});

test('CAS rejects missing, fractional, negative and multiple-row counts', async () => {
  for (const result of [{}, { rowCount: 0.5 }, { rowCount: -1 }, { rowCount: 2 }]) {
    const pool = poolFor(result);
    await assert.rejects(
      createBankFeedPostgresStore(pool).withTransaction(tx => tx.compareAndSwapCheckpoint(scope, previous, next)),
      /Invalid banking checkpoint update result/,
    );
    assert.equal(pool.queries.at(-1), 'ROLLBACK');
  }
});

test('valid CAS counts preserve success and conflict behavior', async () => {
  for (const count of [0, 1]) {
    const pool = poolFor({ rowCount: count });
    const accepted = await createBankFeedPostgresStore(pool).withTransaction(
      tx => tx.compareAndSwapCheckpoint(scope, previous, next),
    );
    assert.equal(accepted, count === 1);
    assert.equal(pool.queries.at(-1), 'COMMIT');
  }
});
