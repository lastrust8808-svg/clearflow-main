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

test('staging migration validates all five tables before declaring success', () => {
  for (const name of ['clearflow_schema_migrations','clearflow_account_snapshots','clearflow_account_records','clearflow_entity_memberships','clearflow_b2b_deliveries']) {
    assert.ok(runner.includes(name), name);
  }
  assert.match(runner, /check\.rowCount !== 5/);
});
