// Runs only against a disposable database provisioned by CI.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encryptJson, decryptJson } from '../utils/secureVault.js';
import { backfillPlaidItems } from '../services/plaidItemMigration.js';
const url = process.env.CLEARFLOW_LEGACY_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/clearflow_legacy_test') throw new Error('Dedicated legacy test database required.');
const client = new pg.Client({ connectionString:url });
try {
  await client.connect();
  assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0,'Legacy test database must start empty.');
  await client.query(`CREATE TABLE clearflow_account_records(account_id TEXT NOT NULL,record_type TEXT NOT NULL,
    record_key TEXT NOT NULL,payload JSONB NOT NULL,version BIGINT NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(account_id,record_type,record_key))`);
  const workspace = { user:{ id:'legacy-user' }, retained:'legacy-workspace' };
  const item = { userId:'local:legacy-user',itemId:'legacy-item',accessToken:'legacy-test-secret',cursor:'legacy-cursor' };
  for (const [kind,payload] of [['app-data',workspace],['plaid',{ encryptedPayload:encryptJson([item]) }],['proof',{ encryptedPayload:encryptJson([{ proof:'retained' }]) }]]) {
    await client.query('INSERT INTO clearflow_account_records(account_id,record_type,record_key,payload) VALUES($1,$2,$3,$4::jsonb)',[item.userId,kind,'default',JSON.stringify(payload)]);
  }
  await client.query(readFileSync(new URL('../db/versions/001_storage_foundation.sql',import.meta.url),'utf8'));
  await client.query('INSERT INTO clearflow_account_snapshots(account_id,app_data) VALUES($1,$2::jsonb)',[item.userId,JSON.stringify({ conflict:true })]);
  await assert.rejects(() => client.query(readFileSync(new URL('../db/versions/002_plaid_items_and_legacy_records.sql',import.meta.url),'utf8')),/Conflicting legacy snapshots/);
  await client.query('ROLLBACK');
  assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name='clearflow_account_records' AND column_name='record_type'")).rows[0].n,1,'Failed upgrade must roll back the column rename.');
  await client.query('UPDATE clearflow_account_snapshots SET app_data=$2::jsonb WHERE account_id=$1',[item.userId,JSON.stringify(workspace)]);
  const apply = async () => { for (const file of ['001_storage_foundation.sql','002_plaid_items_and_legacy_records.sql']) await client.query(readFileSync(new URL('../db/versions/'+file,import.meta.url),'utf8')); };
  await apply(); await apply();
  assert.deepEqual((await client.query('SELECT app_data FROM clearflow_account_snapshots')).rows[0].app_data,workspace);
  await client.query('BEGIN'); assert.equal(await backfillPlaidItems(client),1); await client.query('COMMIT');
  assert.equal(await backfillPlaidItems(client),0,'Backfill is idempotent.');
  const retained = (await client.query('SELECT encrypted_payload FROM clearflow_plaid_items')).rows[0];
  assert.deepEqual(decryptJson(retained.encrypted_payload),item);
  assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM clearflow_account_records WHERE record_key='default'")).rows[0].n,3,'Historical records remain intact.');
  await client.query('UPDATE clearflow_account_snapshots SET app_data=$2::jsonb WHERE account_id=$1',[item.userId,JSON.stringify({ updatedAfterMigration:true })]);
  await apply();
  assert.deepEqual((await client.query('SELECT app_data FROM clearflow_account_snapshots')).rows[0].app_data,{updatedAfterMigration:true},'Repeat deployment must not replay stale historical data.');
  console.log('Legacy record_type schema, workspace/vault keys and encrypted item backfill verified.');
} finally { await client.end(); }
