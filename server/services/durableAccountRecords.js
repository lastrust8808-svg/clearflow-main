import pg from 'pg';
const url = process.env.CLEARFLOW_STORAGE_DATABASE_URL || process.env.CLEARFLOW_OWNER_DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url, max: 5 }) : null;
let initialized;
async function ready() {
  if (!pool) throw new Error('Durable record database unavailable.');
  if (!initialized) initialized = pool.query(`CREATE TABLE IF NOT EXISTS clearflow_account_records (
    account_id TEXT NOT NULL, kind TEXT NOT NULL, record_key TEXT NOT NULL,
    payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(account_id,kind,record_key)
  )`).catch(e => { initialized = null; throw e; });
  await initialized;
}
export const recordsConfigured = () => Boolean(pool);
export async function readRecord(accountId, kind, key) {
  await ready();
  const r = await pool.query('SELECT payload FROM clearflow_account_records WHERE account_id=$1 AND kind=$2 AND record_key=$3',[accountId,kind,key]);
  return r.rows[0]?.payload || null;
}
export async function writeRecord(accountId, kind, key, value) {
  await ready();
  await pool.query(`INSERT INTO clearflow_account_records(account_id,kind,record_key,payload)
  VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(account_id,kind,record_key)
  DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,[accountId,kind,key,JSON.stringify(value)]);
  return { accountId, savedAt: new Date().toISOString() };
}
