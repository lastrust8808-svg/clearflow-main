// Staging-only persistence smoke test. No real banking or payment provider calls.
// Usage: CLEARFLOW_STAGING_DATABASE_URL=... node server/scripts/testStagingPersistence.js
import pg from 'pg';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const url = process.env.CLEARFLOW_STAGING_DATABASE_URL;
if (!url) throw new Error('CLEARFLOW_STAGING_DATABASE_URL required.');
const parsed = new URL(url);
if (decodeURIComponent(parsed.pathname.slice(1)) !== 'clearflow_staging') {
  throw new Error('Refusing non-staging database.');
}
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
const suffix = crypto.randomUUID();
const issuer = 'mock-issuer-' + suffix;
const payer = 'mock-payer-' + suffix;
const entity = 'mock-entity-' + suffix;
const delivery = 'mock-delivery-' + suffix;
try {
  await client.connect();
  assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, 'clearflow_staging');
  await client.query('BEGIN');
  await client.query('SAVEPOINT mock_smoke');
  await client.query('INSERT INTO clearflow_account_snapshots(account_id,app_data) VALUES($1,$2::jsonb)',
    [issuer, JSON.stringify({ test: true, invoice: 'mock' })]);
  assert.deepEqual((await client.query('SELECT app_data FROM clearflow_account_snapshots WHERE account_id=$1', [issuer])).rows[0].app_data,
    { test: true, invoice: 'mock' });
  await client.query('INSERT INTO clearflow_account_records(account_id,kind,record_key,payload) VALUES($1,$2,$3,$4::jsonb)',
    [issuer, 'mock', 'invoice', JSON.stringify({ amountCents: 2550 })]);
  assert.equal((await client.query('SELECT payload FROM clearflow_account_records WHERE account_id=$1 AND kind=$2 AND record_key=$3',
    [issuer, 'mock', 'invoice'])).rows[0].payload.amountCents, 2550);
  await client.query('INSERT INTO clearflow_entity_memberships(account_id,entity_id,permission,granted_by) VALUES($1,$2,$3,$4)',
    [payer, entity, 'payment_approve', 'mock-test']);
  assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM clearflow_entity_memberships WHERE account_id=$1 AND entity_id=$2 AND revoked_at IS NULL',
    [payer, entity])).rows[0].count, 1);
  assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM clearflow_entity_memberships WHERE account_id=$1 AND entity_id=$2',
    [issuer, entity])).rows[0].count, 0);
  await client.query('INSERT INTO clearflow_b2b_deliveries(delivery_id,issuer_account_id,invoice_id,payer_entity_id,payee_entity_id,invoice_payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
    [delivery, issuer, 'mock-invoice', entity, 'mock-vendor', JSON.stringify({ amountCents: 2550 })]);
  assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM clearflow_b2b_deliveries WHERE delivery_id=$1', [delivery])).rows[0].count, 1);
  await client.query('ROLLBACK TO SAVEPOINT mock_smoke');
  assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM clearflow_account_snapshots WHERE account_id=$1', [issuer])).rows[0].count, 0);
  await client.query('ROLLBACK');
  console.log('Staging persistence smoke test passed; mock records rolled back.');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  await client.end();
}
