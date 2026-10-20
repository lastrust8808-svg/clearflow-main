import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../server/db/versions/001_storage_foundation.sql', import.meta.url), 'utf8');
const schemaGate = readFileSync(new URL('../server/scripts/checkDeploymentSchema.js', import.meta.url), 'utf8');
const services = [
  'durableAccountSnapshots.js',
  'durableAccountRecords.js',
  'b2bMembership.js',
  'b2bDelivery.js'
].map(name => readFileSync(new URL('../server/services/' + name, import.meta.url), 'utf8'));

test('storage foundation migration is additive, transaction-scoped and versioned', () => {
  assert.match(migration, /\bBEGIN\s*;/i);
  assert.match(migration, /\bCOMMIT\s*;/i);
  assert.doesNotMatch(migration, /\b(DROP|TRUNCATE|DELETE|ALTER)\s+(TABLE|FROM)\b/i);
  assert.match(migration, /INSERT INTO public\.clearflow_schema_migrations\s*\(version\)/i);
  assert.match(migration, /ON CONFLICT\s*\(version\)\s*DO NOTHING/i);
});

test('every required storage table has an additive migration definition', () => {
  const names = [
    'clearflow_account_snapshots',
    'clearflow_account_records',
    'clearflow_entity_memberships',
    'clearflow_b2b_deliveries',
    'clearflow_schema_migrations'
  ];
  for (const name of names) {
    assert.match(migration, new RegExp('CREATE TABLE IF NOT EXISTS public\\.' + name + '\\s*\\(', 'i'), name);
  }
});

test('runtime storage tables and deployment gate agree with migration', () => {
  for (const service of services) {
    const match = service.match(/CREATE TABLE IF NOT EXISTS\s+(clearflow_[a-z_]+)/i);
    assert.ok(match, 'expected a runtime storage table');
    assert.ok(migration.includes('public.' + match[1]), match[1]);
    assert.ok(schemaGate.includes(match[1]), match[1]);
  }
});

test('migration includes constraints needed by account and B2B authorization', () => {
  assert.match(migration, /PRIMARY KEY\s*\(account_id,\s*kind,\s*record_key\)/i);
  assert.match(migration, /PRIMARY KEY\s*\(account_id,\s*entity_id,\s*permission\)/i);
  assert.match(migration, /CHECK\s*\(permission IN\s*\('invoice_create',\s*'payment_approve'\)\)/i);
  assert.match(migration, /UNIQUE\s*\(issuer_account_id,\s*invoice_id\)/i);
});
