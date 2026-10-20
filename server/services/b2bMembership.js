import pg from 'pg';
const url = process.env.CLEARFLOW_STORAGE_DATABASE_URL || process.env.CLEARFLOW_OWNER_DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url, max: 3 }) : null;
let initialized;
async function ready() {
  if (!pool) throw new Error('B2B authorization database unavailable.');
  if (!initialized) initialized = pool.query(`CREATE TABLE IF NOT EXISTS clearflow_entity_memberships (
    account_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    permission TEXT NOT NULL CHECK(permission IN ('invoice_create','payment_approve')),
    granted_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY(account_id, entity_id, permission)
  )`).catch(error => { initialized = null; throw error; });
  await initialized;
}
export async function hasEntityPermission(accountId, entityId, permission) {
  await ready();
  const result = await pool.query(`SELECT 1 FROM clearflow_entity_memberships
    WHERE account_id=$1 AND entity_id=$2 AND permission=$3 AND revoked_at IS NULL`,
    [accountId, entityId, permission]);
  return result.rowCount === 1;
}
// Grants must be provisioned by a separately authenticated administrative process.
// There is intentionally no browser-facing grant or self-enrollment endpoint.
