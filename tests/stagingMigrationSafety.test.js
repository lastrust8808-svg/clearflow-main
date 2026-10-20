import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../server/db/versions/001_storage_foundation.sql', import.meta.url), 'utf8');

test('migration never targets production or external databases', () => {
  assert.doesNotMatch(sql, /\\connect|dblink|postgres_fdw|CREATE EXTENSION|CREATE DATABASE|DROP DATABASE/i);
  assert.doesNotMatch(sql, /clearflow_owner\b/i);
});

test('all five staging foundation tables are created idempotently', () => {
  const expected = [
    'clearflow_schema_migrations',
    'clearflow_account_snapshots',
    'clearflow_account_records',
    'clearflow_entity_memberships',
    'clearflow_b2b_deliveries'
  ];
  for (const name of expected) {
    const pattern = new RegExp('CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.' + name + '\\s*\\(', 'gi');
    assert.equal([...sql.matchAll(pattern)].length, 1, name);
  }
  assert.equal((sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/gi) || []).length, expected.length);
});

test('migration records its version in same transaction as schema creation', () => {
  const begin = sql.search(/\bBEGIN\s*;/i);
  const insert = sql.search(/INSERT\s+INTO\s+public\.clearflow_schema_migrations/i);
  const commit = sql.search(/\bCOMMIT\s*;/i);
  assert.ok(begin >= 0 && insert > begin && commit > insert);
  assert.match(sql, /ON\s+CONFLICT\s*\(version\)\s*DO\s+NOTHING/i);
});

test('staging schema includes optimistic revisions and revoked membership checks', () => {
  assert.match(sql, /revision\s+BIGINT\s+NOT\s+NULL\s+DEFAULT\s+1/i);
  assert.match(sql, /revoked_at\s+TIMESTAMPTZ/i);
  assert.match(sql, /invoice_payload\s+JSONB\s+NOT\s+NULL/i);
});
