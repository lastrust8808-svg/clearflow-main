import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFeedPostgresStore } from '../server/services/bankFeedPostgresStore.js';

test('outgoing multi-row INSERTs retain authorized scope and evidence after asynchronous mutation', async () => {
  const scope = {
    tenantId: 'tenant-original', provider: 'plaid',
    connectionId: 'connection-original', allowedAccountIds: ['account-original'],
  };
  const first = {
    tenantId: 'tenant-original', provider: 'plaid',
    connectionId: 'connection-original', accountId: 'account-original',
    transactionId: 'tx-1', amountMinor: 125,
  };
  const second = { ...first, transactionId: 'tx-2', amountMinor: 250 };
  const batch = [first, second];
  const inserts = [];
  const statements = [];
  const pool = {
    async connect() {
      return {
        async query(sql, parameters) {
          statements.push(sql);
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          if (!sql.includes('INSERT INTO public.clearflow_bank_feed_entries')) {
            throw new Error('Unexpected SQL');
          }
          inserts.push(structuredClone(parameters));
          if (inserts.length === 1) {
            scope.tenantId = 'tenant-foreign';
            scope.connectionId = 'connection-foreign';
            scope.allowedAccountIds[0] = 'account-foreign';
            first.amountMinor = 999999;
            second.amountMinor = 999999;
            second.transactionId = 'tx-foreign';
            batch[1] = { ...second };
          }
          return { rowCount: 1 };
        },
        release() {},
      };
    },
  };
  const store = createBankFeedPostgresStore(pool);
  await store.withTransaction(tx => tx.saveEntries(scope, batch));
  assert.equal(inserts.length, 2);
  for (const parameters of inserts) {
    assert.deepEqual(parameters.slice(0, 4), [
      'tenant-original', 'plaid', 'connection-original', 'account-original',
    ]);
  }
  assert.deepEqual(inserts.map(p => p[4]), ['tx-1', 'tx-2']);
  assert.deepEqual(inserts.map(p => JSON.parse(p[5]).amountMinor), [125, 250]);
  assert.equal(statements.at(-1), 'COMMIT');
});

test('direct adapter refuses noncanonical authorization scopes before financial SQL', async () => {
  const base = {
    tenantId: 'tenant-original', provider: 'plaid',
    connectionId: 'connection-original', allowedAccountIds: ['account-original'],
  };
  const statements = [];
  let getterCalls = 0;
  const pool = {
    async connect() {
      return {
        async query(sql) { statements.push(sql); return { rows: [] }; },
        release() {},
      };
    },
  };
  const store = createBankFeedPostgresStore(pool);
  const entry = {
    ...base, accountId: 'account-original', transactionId: 'tx-1', amountMinor: 125,
  };
  const inherited = Object.assign(Object.create({ foreign: 'tenant' }), base);
  const extra = { ...base, unexpected: 'foreign' };
  const accessor = { ...base };
  Object.defineProperty(accessor, 'unexpected', {
    enumerable: true, get() { getterCalls++; throw new Error('executed getter'); },
  });
  const symbol = { ...base, [Symbol('hidden')]: 'foreign' };
  const customAccounts = { ...base, allowedAccountIds: Object.assign(['account-original'], { extra: true }) };
  const customPrototypeAccounts = { ...base, allowedAccountIds: ['account-original'] };
  Object.setPrototypeOf(customPrototypeAccounts.allowedAccountIds, Object.create(Array.prototype));
  for (const scope of [inherited, extra, accessor, symbol, customAccounts, customPrototypeAccounts]) {
    await assert.rejects(
      store.withTransaction(tx => tx.saveEntries(scope, [entry])),
      /Invalid authenticated banking scope/,
    );
  }
  assert.equal(getterCalls, 0);
  assert.ok(statements.every(sql => sql === 'BEGIN' || sql === 'ROLLBACK'));
});
