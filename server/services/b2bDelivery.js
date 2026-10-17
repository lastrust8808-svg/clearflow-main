import pg from 'pg';
const url = process.env.CLEARFLOW_STORAGE_DATABASE_URL || process.env.CLEARFLOW_OWNER_DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url, max: 3 }) : null;
let initialized;
async function ready() {
  if (!pool) throw new Error('Invoice delivery database unavailable.');
  if (!initialized) initialized = pool.query(`CREATE TABLE IF NOT EXISTS clearflow_b2b_deliveries (
    delivery_id TEXT PRIMARY KEY,
    issuer_account_id TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    payer_entity_id TEXT NOT NULL,
    payee_entity_id TEXT NOT NULL,
    invoice_payload JSONB NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (issuer_account_id, invoice_id)
  )`).catch(error => { initialized = null; throw error; });
  await initialized;
}
export async function publishInvoiceDelivery(issuerAccountId, invoice) {
  await ready();
  const id = issuerAccountId + ':' + invoice.id;
  const result = await pool.query(`INSERT INTO clearflow_b2b_deliveries
    (delivery_id,issuer_account_id,invoice_id,payer_entity_id,payee_entity_id,invoice_payload)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)
    ON CONFLICT DO NOTHING RETURNING delivery_id`,
    [id,issuerAccountId,invoice.id,invoice.payerEntityId,invoice.payeeEntityId,JSON.stringify(invoice)]);
  return result.rowCount === 1 ? id : null;
}
export async function getDeliveredInvoice(deliveryId, accountId, role) {
  await ready();
  if (role !== 'payer' && role !== 'issuer') throw new Error('Invalid invoice role.');
  const column = role === 'payer' ? 'payer_entity_id' : 'payee_entity_id';
  const permission = role === 'payer' ? 'payment_approve' : 'invoice_create';
  const result = await pool.query(`SELECT d.invoice_payload, d.issuer_account_id, d.invoice_id
    FROM clearflow_b2b_deliveries d
    WHERE d.delivery_id=$1
    AND EXISTS (SELECT 1 FROM clearflow_entity_memberships m
      WHERE m.account_id=$2 AND m.entity_id=d.${column}
      AND m.permission=$3 AND m.revoked_at IS NULL)`,
    [deliveryId,accountId,permission]);
  return result.rows[0] || null;
}
export async function listPayerDeliveries(accountId, limit = 50) {
  await ready();
  const result = await pool.query(`SELECT d.delivery_id, d.invoice_payload, d.published_at
    FROM clearflow_b2b_deliveries d
    WHERE EXISTS (SELECT 1 FROM clearflow_entity_memberships m
      WHERE m.account_id=$1 AND m.entity_id=d.payer_entity_id
      AND m.permission='payment_approve' AND m.revoked_at IS NULL)
    ORDER BY d.published_at DESC, d.delivery_id DESC LIMIT $2`, [accountId,Math.min(100,Math.max(1,limit))]);
  return result.rows;
}
