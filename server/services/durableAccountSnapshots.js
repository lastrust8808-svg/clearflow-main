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
  if (expectedRevision === null) {
    const created = await pool.query(
      'INSERT INTO clearflow_account_snapshots(account_id,app_data) VALUES($1,$2::jsonb) ON CONFLICT(account_id) DO NOTHING RETURNING revision,updated_at',
      [accountId, JSON.stringify(appData)]
    );
    if (!created.rows.length) {
      const error = new Error('Account revision conflict. Reload before saving.');
      error.statusCode = 409;
      throw error;
    }
    return created.rows[0];
  }
  const updated = await pool.query(
    'UPDATE clearflow_account_snapshots SET app_data=$2::jsonb,revision=revision+1,updated_at=NOW() WHERE account_id=$1 AND revision=$3 RETURNING revision,updated_at',
    [accountId, JSON.stringify(appData), expectedRevision]
  );
  if (!updated.rows.length) {
    const error = new Error('Account revision conflict. Reload before saving.');
    error.statusCode = 409;
    throw error;
  }
  return updated.rows[0];
}
