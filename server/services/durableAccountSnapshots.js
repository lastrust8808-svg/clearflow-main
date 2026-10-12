import pg from 'pg';

const connectionString = process.env.CLEARFLOW_STORAGE_DATABASE_URL ||
  process.env.CLEARFLOW_OWNER_DATABASE_URL;
const pool = connectionString ? new pg.Pool({ connectionString, max: 5 }) : null;
let initialized;
async function ready() {
  if (!pool) throw new Error('Durable account database is not configured.');
  if (!initialized) {
    initialized = pool.query(`CREATE TABLE IF NOT EXISTS clearflow_account_snapshots (
      account_id TEXT PRIMARY KEY,
      app_data JSONB NOT NULL,
      revision BIGINT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).catch(error => { initialized = null; throw error; });
  }
  await initialized;
}
export function durableAccountStorageConfigured() { return Boolean(pool); }
export async function readAccountSnapshot(accountId) {
  await ready();
  const result = await pool.query(
    'SELECT app_data,revision,updated_at FROM clearflow_account_snapshots WHERE account_id=$1',
    [accountId]
  );
  return result.rows[0] || null;
}
export async function writeAccountSnapshot(accountId, appData, expectedRevision = null) {
  await ready();
  const result = await pool.query(`INSERT INTO clearflow_account_snapshots
    (account_id,app_data) VALUES($1,$2::jsonb)
    ON CONFLICT(account_id) DO UPDATE SET
      app_data=EXCLUDED.app_data,
      revision=clearflow_account_snapshots.revision+1,
      updated_at=NOW()
    RETURNING revision,updated_at`, [accountId, JSON.stringify(appData)]);
  return result.rows[0];
}
