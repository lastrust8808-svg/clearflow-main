import pg from 'pg';
import { encryptJson, decryptJson } from '../utils/secureVault.js';

const url = process.env.CLEARFLOW_STORAGE_DATABASE_URL || process.env.CLEARFLOW_OWNER_DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url, max: 3 }) : null;
export const plaidItemStorageConfigured = () => Boolean(pool);

// The global item ID is provider-owned. It is never an authorization credential.
export async function readPlaidItem(itemId) {
  if (!pool) throw new Error('Durable Plaid storage unavailable.');
  const result = await pool.query('SELECT account_id, encrypted_payload, revision FROM clearflow_plaid_items WHERE item_id=$1', [itemId]);
  const row = result.rows[0];
  if (!row) return null;
  const item = decryptJson(row.encrypted_payload);
  if (item.itemId !== itemId || item.userId !== row.account_id) throw new Error('Plaid storage identity mismatch.');
  return { ...item, revision: row.revision };
}

export async function writePlaidItem(item) {
  if (!pool) throw new Error('Durable Plaid storage unavailable.');
  const { revision, ...payload } = item;
  const encrypted = JSON.stringify(encryptJson(payload));
  const result = revision == null
    ? await pool.query(`INSERT INTO clearflow_plaid_items(item_id,account_id,encrypted_payload)
        VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING revision`, [item.itemId, item.userId, encrypted])
    : await pool.query(`UPDATE clearflow_plaid_items SET encrypted_payload=$3::jsonb,
        revision=revision+1,updated_at=NOW() WHERE item_id=$1 AND account_id=$2 AND revision=$4
        RETURNING revision`, [item.itemId, item.userId, encrypted, revision]);
  if (!result.rowCount) {
    const error = new Error('Bank connection revision conflict. Retry from durable state.');
    error.statusCode = 409;
    throw error;
  }
  item.revision = result.rows[0].revision;
  return item;
}
