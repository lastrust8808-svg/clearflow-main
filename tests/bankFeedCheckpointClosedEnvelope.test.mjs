import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

const scope = { tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', allowedAccountIds: ['account-a'] };
const previous = { tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a', cursor: 'old', revision: 1 };
const next = { ...previous, cursor: 'new', revision: 2 };

function poolFixture() {
  const statements = [];
  return {
    statements,
    async connect() {
      return {
        async query(sql) {
          statements.push(sql);
          if (['BEGIN', 'ROLLBACK', 'COMMIT'].includes(sql)) return { rows: [] };
          if (sql.includes('UPDATE public.clearflow_bank_feed_checkpoints')) return { rowCount: 1 };
          throw Error('Unexpected SQL');
        },
        release() {},
      };
    },
  };
}

for (const [label, mutate] of [
  ['extra field', value => ({ ...value, unexpected: 'data' })],
  ['non-enumerable field', value => Object.defineProperty({ ...value }, 'cursor', { value: value.cursor, enumerable: false })],
  ['inherited fields', value => Object.assign(Object.create({ tenantId: value.tenantId }), { provider: value.provider, connectionId: value.connectionId, cursor: value.cursor, revision: value.revision })],
  ['custom prototype', value => Object.assign(Object.create({ custom: true }), value)],
  ['symbol field', value => Object.assign({ ...value }, { [Symbol('hidden')]: true })],
]) {
  test('checkpoint CAS rejects ' + label + ' before UPDATE', async () => {
    for (const target of ['previous', 'next']) {
      const pool = poolFixture();
      const a = target === 'previous' ? mutate(previous) : previous;
      const b = target === 'next' ? mutate(next) : next;
      await assert.rejects(
        createBankFeedPostgresStore(pool).withTransaction(tx => tx.compareAndSwapCheckpoint(scope, a, b)),
        /Refusing out-of-scope banking checkpoint update/,
      );
      assert.deepEqual(pool.statements, ['BEGIN', 'ROLLBACK']);
    }
  });
}

test('canonical checkpoint CAS envelope still succeeds', async () => {
  const pool = poolFixture();
  assert.equal(await createBankFeedPostgresStore(pool).withTransaction(tx =>
    tx.compareAndSwapCheckpoint(scope, previous, next)), true);
  assert.equal(pool.statements.at(-1), 'COMMIT');
});
