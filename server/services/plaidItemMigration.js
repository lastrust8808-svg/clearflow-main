import { decryptJson, encryptJson } from '../utils/secureVault.js';

// Caller owns the transaction. Never overwrite a newer per-item record.
export async function backfillPlaidItems(client) {
  const result = await client.query("SELECT account_id,payload FROM clearflow_account_records WHERE kind='plaid' AND record_key='connections'");
  let inserted = 0;
  for (const row of result.rows) {
    if (!row.payload?.encryptedPayload) throw new Error('Legacy Plaid vault is not encrypted.');
    const connections = decryptJson(row.payload.encryptedPayload);
    if (!Array.isArray(connections)) throw new Error('Legacy Plaid vault is malformed.');
    for (const item of connections) {
      if (!item.itemId || !item.accessToken || item.userId !== row.account_id) throw new Error('Legacy Plaid ownership mismatch.');
      const created = await client.query(`INSERT INTO clearflow_plaid_items(item_id,account_id,encrypted_payload)
        VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING`, [item.itemId, row.account_id, JSON.stringify(encryptJson(item))]);
      const existing = await client.query('SELECT account_id FROM clearflow_plaid_items WHERE item_id=$1', [item.itemId]);
      if (existing.rows[0]?.account_id !== row.account_id) throw new Error('Conflicting Plaid item owner.');
      inserted += created.rowCount;
    }
  }
  return inserted;
}
