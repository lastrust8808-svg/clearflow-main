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
  if (check.rowCount !== 5) throw new Error('Migration verification failed.');
  console.log('Staging migration applied and five required tables verified.');
} finally {
  await client.end();
}
