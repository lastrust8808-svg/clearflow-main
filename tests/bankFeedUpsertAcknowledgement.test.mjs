import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

const scope = () => ({
  tenantId: 'tenant-a', provider: 'plaid',
  connectionId: 'connection-a', allowedAccountIds: ['account-a'],
});
const entry = () => ({
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'connection-a',
  accountId: 'account-a', transactionId: 'tx-1', amountMinor: 100,
});

for (const [name, makeResult] of [
  ['zero affected rows', () => ({ rowCount: 0 })],
  ['multiple affected rows', () => ({ rowCount: 2 })],
  ['missing row count', () => ({})],
  ['fractional row count', () => ({ rowCount: 1.5 })],
  ['string row count', () => ({ rowCount: '1' })],
  ['null envelope', () => null],
  ['Proxy envelope', () => new Proxy({ rowCount: 1 }, {
    get(_target, key) { if (key === 'then') return undefined; throw Error('Proxy get executed'); },
    getOwnPropertyDescriptor() { throw Error('Proxy descriptor executed'); },
  })],
  ['getter-backed row count', () => Object.defineProperty({}, 'rowCount', {
    enumerable: true, get() { throw Error('rowCount getter executed'); },
  })],
]) {
  test('banking entry upsert rejects ' + name + ' and rolls back', async () => {
    const sql = [];
    const pool = { async connect() { return {
      async query(statement) {
        sql.push(statement);
        if (statement.includes('INSERT INTO public.clearflow_bank_feed_entries')) return makeResult();
        return { rows: [] };
      },
      release() {},
    }; } };
    await assert.rejects(
      createBankFeedPostgresStore(pool).withTransaction(tx => tx.saveEntries(scope(), [entry()])),
      /Invalid banking entry upsert result/,
    );
    assert.equal(sql.at(-1), 'ROLLBACK');
    assert.equal(sql.includes('COMMIT'), false);
  });
}

test('one-row banking upsert commits', async () => {
  const sql = [];
  const pool = { async connect() { return {
    async query(statement) {
      sql.push(statement);
      return statement.includes('INSERT INTO public.clearflow_bank_feed_entries')
        ? { rowCount: 1 } : { rows: [] };
    },
    release() {},
  }; } };
  await createBankFeedPostgresStore(pool).withTransaction(tx => tx.saveEntries(scope(), [entry()]));
  assert.equal(sql.at(-1), 'COMMIT');
});
