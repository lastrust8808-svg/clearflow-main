import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync(new URL('../server/scripts/applyStagingMigration.js', import.meta.url), 'utf8');

test('staging migration requires dedicated credential and verifies database identity', () => {
  assert.match(runner, /CLEARFLOW_STAGING_DATABASE_URL/);
  assert.match(runner, /parsed\.pathname\.slice\(1\)/);
  assert.match(runner, /result\.rows\[0\]\?\.name !== 'clearflow_staging'/);
  assert.doesNotMatch(runner, /CLEARFLOW_OWNER_DATABASE_URL|DATABASE_URL\s*\|\|/);
});

test('staging migration validates all six tables and both migration versions before declaring success', () => {
  for (const name of ['clearflow_schema_migrations','clearflow_account_snapshots','clearflow_account_records','clearflow_entity_memberships','clearflow_b2b_deliveries','clearflow_plaid_items']) {
    assert.ok(runner.includes(name), name);
  }
  assert.match(runner, /required\.some\(name => !found\.has\(name\)\)/);
  assert.match(runner, /versions\.rowCount !== 2/);
  assert.match(runner, /002_plaid_items_and_legacy_records/);
  assert.match(runner, /clearflow_plaid_items\.encrypted_payload/);
  assert.match(runner, /clearflow_plaid_items\.revision/);
  assert.match(runner, /names\.has\(key\)/);
});
