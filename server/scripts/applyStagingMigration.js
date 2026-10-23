// Execute only from an authorized private runtime with a staging-only database URL.
// Usage: CLEARFLOW_STAGING_DATABASE_URL=... node server/scripts/applyStagingMigration.js
import pg from 'pg';
import { readFileSync } from 'node:fs';
const url = process.env.CLEARFLOW_STAGING_DATABASE_URL;
if (!url) throw new Error('CLEARFLOW_STAGING_DATABASE_URL is required.');
const parsed = new URL(url);
if (!['clearflow_staging'].includes(decodeURIComponent(parsed.pathname.slice(1)))) {
  throw new Error('Refusing migration: target database is not clearflow_staging.');
}
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const result = await client.query('SELECT current_database() AS name');
  if (result.rows[0]?.name !== 'clearflow_staging') throw new Error('Database identity mismatch.');
  const sql = readFileSync(new URL('../db/versions/001_storage_foundation.sql', import.meta.url), 'utf8');
  await client.query(sql);
  const check = await client.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name = ANY($1::text[])`, [[
      'clearflow_schema_migrations','clearflow_account_snapshots',
      'clearflow_account_records','clearflow_entity_memberships','clearflow_b2b_deliveries'
    ]]);
  const found = new Set(check.rows.map(row => row.table_name));
  const required = [
    'clearflow_schema_migrations', 'clearflow_account_snapshots',
    'clearflow_account_records', 'clearflow_entity_memberships',
    'clearflow_b2b_deliveries',
  ];
  if (required.some(name => !found.has(name))) throw new Error('Migration verification failed: required table missing.');
  const version = await client.query('SELECT version FROM public.clearflow_schema_migrations WHERE version = $1', ['001_storage_foundation']);
  if (version.rowCount !== 1) throw new Error('Migration version was not recorded.');
  const columns = await client.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name = ANY($1::text[])`, [required]);
  const names = new Set(columns.rows.map(row => `${row.table_name}.${row.column_name}`));
  for (const key of ['clearflow_account_snapshots.revision', 'clearflow_account_records.payload',
    'clearflow_entity_memberships.revoked_at', 'clearflow_b2b_deliveries.invoice_payload']) {
    if (!names.has(key)) throw new Error(`Migration verification failed: ${key} missing.`);
  }
  console.log('Staging migration applied and five required tables verified.');
} finally {
  await client.end();
}
