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

test('account snapshots use database upsert', () => {
  const database = source('server/services/durableAccountSnapshots.js');
  assert.match(database, /CREATE TABLE IF NOT EXISTS clearflow_account_snapshots/);
  assert.match(database, /ON CONFLICT\(account_id\) DO UPDATE/);
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
