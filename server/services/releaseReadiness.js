import pg from 'pg';
const storageTables = ['clearflow_schema_migrations','clearflow_account_snapshots','clearflow_account_records','clearflow_entity_memberships','clearflow_b2b_deliveries','clearflow_plaid_items'];
const authTables = ['clearflow_identity','clearflow_login_challenges','clearflow_login_sessions'];
const ownerTables = ['clearflow_owner_workspaces','clearflow_owner_audit_log','clearflow_owner_provider_events'];
const requiredColumns = {
  clearflow_account_snapshots: ['account_id','app_data','revision'],
  clearflow_account_records: ['account_id','kind','record_key','payload'],
  clearflow_entity_memberships: ['account_id','entity_id','permission','revoked_at'],
  clearflow_b2b_deliveries: ['delivery_id','invoice_payload','payer_entity_id'],
  clearflow_plaid_items: ['item_id','account_id','encrypted_payload','revision'],
  clearflow_identity: ['id','email','disabled'],
  clearflow_login_challenges: ['email','digest','expires','attempts'],
  clearflow_login_sessions: ['digest','user_id','expires','revoked'],
  clearflow_owner_workspaces: ['account_id','app_data','version'],
};
export function productionDatabaseTargets(env = process.env) {
  const storage = env.CLEARFLOW_STORAGE_DATABASE_URL || env.CLEARFLOW_OWNER_DATABASE_URL;
  const auth = env.CLEARFLOW_AUTH_DATABASE_URL || env.CLEARFLOW_OWNER_DATABASE_URL;
  if (!storage || !auth || (env.CLEARFLOW_AUTH_SECRET || '').trim().length < 32) {
    throw new Error('Production requires durable storage and authentication database configuration and an authentication secret of at least 32 characters.');
  }
  return [{url:storage,tables:storageTables},{url:auth,tables:authTables},
    ...(env.CLEARFLOW_OWNER_DATABASE_URL ? [{url:env.CLEARFLOW_OWNER_DATABASE_URL,tables:ownerTables}] : [])];
}
export async function checkProductionReadiness(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  for (const target of productionDatabaseTargets(env)) {
    const client = new pg.Client({connectionString:target.url,connectionTimeoutMillis:5000,query_timeout:5000});
    try {
      await client.connect();
      const result=await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name=ANY($2::text[])',['public',target.tables]);
      const present=new Set(result.rows.map(row=>row.table_name));
      if(target.tables.some(name=>!present.has(name))) throw new Error('Required production database schema is missing. Apply and verify migrations before release.');
      const columns=await client.query('SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2::text[])',['public',target.tables]);
      const found=new Set(columns.rows.map(row=>`${row.table_name}.${row.column_name}`));
      for(const table of target.tables) for(const column of requiredColumns[table] || []) {
        if(!found.has(`${table}.${column}`)) throw new Error('Required production database columns are missing.');
      }
      if(target.tables.includes('clearflow_schema_migrations')) {
        const versions=await client.query('SELECT version FROM public.clearflow_schema_migrations WHERE version=ANY($1::text[])', [['001_storage_foundation','002_plaid_items_and_legacy_records']]);
        if(versions.rowCount!==2) throw new Error('Required production migrations are not recorded.');
      }

    } finally { await client.end(); }
  }
}
