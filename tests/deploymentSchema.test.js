import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('release gate checks all required production storage tables', () => {
  const source = readFileSync(new URL('../server/scripts/checkDeploymentSchema.js', import.meta.url), 'utf8');
  for (const table of ['clearflow_account_snapshots', 'clearflow_account_records', 'clearflow_owner_workspaces', 'clearflow_owner_audit_log', 'clearflow_owner_provider_events']) {
    assert.ok(source.includes(table), table);
  }
  assert.match(source, /process\.exitCode = 1/);
  assert.doesNotMatch(source, /CREATE TABLE|DROP TABLE|ALTER TABLE/);
});
