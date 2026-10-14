import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('production account writes cannot fall back to ephemeral filesystem', () => {
  const storage = source('server/services/accountStorage.js');
  assert.match(storage, /durableAccountStorageConfigured\(\)/);
  assert.match(storage, /process\.env\.NODE_ENV === 'production'/);
  assert.match(storage, /Durable account database required in production/);
});

test('account snapshots use revision-aware writes', () => {
  const database = source('server/services/durableAccountSnapshots.js');
  assert.match(database, /CREATE TABLE IF NOT EXISTS clearflow_account_snapshots/);
  assert.match(database, /ON CONFLICT\(account_id\) DO NOTHING/);
  assert.match(database, /revision=revision\+1/);
});

test('frontend waits for server save acknowledgement', () => {
  const auth = source('src/contexts/AuthContext.tsx');
  assert.match(auth, /saveAccountAppData\(state\.localAccountId, state\.appData\)\s*\.then/);
  assert.match(auth, /setSavingStatus\('error'\)/);
});

test('writes are serialized for each account', () => {
  const persistence = source('src/services/accountPersistence.service.ts');
  assert.match(persistence, /accountWriteQueues/);
  assert.match(persistence, /previous\.catch\(\(\) => undefined\)\.then/);
});

test('document and vault records use persistent storage', () => {
  const storage = source('server/services/accountStorage.js');
  const database = source('server/services/durableAccountRecords.js');
  for (const kind of ['file', 'remittance', 'proof', 'plaid', 'extraction']) {
    assert.ok(storage.includes("writeRecord(accountId, '" + kind + "'"));
  }
  assert.match(database, /CREATE TABLE IF NOT EXISTS clearflow_account_records/);
  assert.match(storage, /Durable record database required/);
});
test('legacy migration uses canonical record keys', () => {
  const migration = source('server/scripts/migrateLegacyStorage.js');
  assert.match(migration, /kind === 'proof' \? 'chains'/);
  assert.match(migration, /decodeURIComponent\(key\)/);
});

test('Plaid item access requires the verified account', () => {
  const plaid = source('server/routes/plaid.js');
  const identity = plaid.split("router.post('/identity/get'")[1].split("router.post('/identity/match'")[0];
  const sync = plaid.split("router.post('/transactions/sync'")[1].split("router.post('/webhook'")[0];
  assert.ok(identity.includes('item.userId !== verifiedAccountId'));
  assert.ok(sync.includes('item.userId !== verifiedAccountId'));
  assert.ok(sync.indexOf('item.userId !== verifiedAccountId') < sync.indexOf('await syncPlaidItemChanges(itemId)'));
});


test('migration verifies stored JSONB content without relying on key order', () => {
  const migration = source('server/scripts/migrateLegacyStorage.js');
  assert.match(migration, /isDeepStrictEqual\(readback\.rows\[0\]\.payload, payload\)/);
  assert.match(migration, /Migration readback mismatch/);
  assert.match(migration, /if \(apply\)/);
});
