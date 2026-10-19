import pg from 'pg';
const url = process.env.CLEARFLOW_STORAGE_DATABASE_URL || process.env.CLEARFLOW_OWNER_DATABASE_URL;
if (!url) throw new Error('Database URL is required');
const pool = new pg.Pool({ connectionString: url, max: 1 });
const tables = ['clearflow_account_snapshots', 'clearflow_account_records', 'clearflow_entity_memberships', 'clearflow_b2b_deliveries', 'clearflow_schema_migrations', 'clearflow_owner_workspaces', 'clearflow_owner_audit_log', 'clearflow_owner_provider_events'];
try {
  const result = await pool.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name = ANY($2::text[])', ['public', tables]);
  const present = new Set(result.rows.map(row => row.table_name));
  const missing = tables.filter(name => !present.has(name));
  process.stdout.write(JSON.stringify({ ready: missing.length === 0, missing }) + '\n');
  if (missing.length) process.exitCode = 1;
} finally {
  await pool.end();
}
