import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import crypto from 'node:crypto';

const url = process.env.CLEARFLOW_STAGING_DATABASE_URL;
if (!url || new URL(url).pathname !== '/clearflow_staging') throw new Error('Disposable clearflow_staging database required.');
process.env.CLEARFLOW_OWNER_DATABASE_URL = url;
process.env.CLEARFLOW_OWNER_EMAIL = `concurrency-${crypto.randomUUID()}@example.test`;
const owner = await import('../../server/services/ownerDatabase.js');
const accountId = owner.ownerAccountIdFromEmail(process.env.CLEARFLOW_OWNER_EMAIL);

test('concurrent payment progress and reversal cannot silently lose a failed state', {timeout:20000}, async t => {
  const client = new pg.Client({connectionString:url});await client.connect();
  t.after(()=>client.end());
  const execution={executionProvider:'mercury',executionReference:'request-race'};
  await owner.saveOwnerWorkspace({accountId,expectedVersion:0,appData:{user:{email:process.env.CLEARFLOW_OWNER_EMAIL},coreDataSnapshot:{
    settlements:[{id:'settlement-race',...execution,grossAmount:45}],
    payments:[{id:'payment-race',status:'initiated',amount:45,settlementExecution:execution}],
    bills:[{id:'bill-race',balanceDue:45,status:'open',linkedPaymentIds:['payment-race']}],
    obligations:[],invoices:[],journalEntries:[],transactions:[],vendors:[],
  }}});
  const apply=status=>owner.applyMercuryProviderUpdateToOwnerWorkspace({accountId,requestId:'request-race',transaction:{id:'transaction-race',requestId:'request-race',status}});
  await client.query('BEGIN');
  await client.query('SELECT version FROM clearflow_owner_workspaces WHERE account_id=$1 FOR UPDATE',[accountId]);
  const pending = Promise.allSettled([apply('sent'),apply('reversed')]);
  let blocked=false;
  try {
    // Both updaters must read the original snapshot before either can commit.
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){
      // PostgreSQL caches activity snapshots within this lock-holding transaction.
      await client.query('SELECT pg_stat_clear_snapshot()');
      const result=await client.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%SELECT version%clearflow_owner_workspaces%'");
      if(result.rows[0].n>=2){blocked=true;break;}
      await new Promise(resolve=>setTimeout(resolve,20));
    }
  } finally {await client.query('ROLLBACK');}
  const outcomes=await pending;
  assert.ok(blocked,'Both writes must be competing on the same retained version.');
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  const rejected=outcomes.find(r=>r.status==='rejected');assert.match(rejected.reason.message,/version conflict/);
  // Model retry after the rejected webhook response; retrying either status is safe.
  await apply('reversed');await apply('sent');
  const row=await owner.loadOwnerWorkspace(accountId);
  assert.equal(row.app_data.coreDataSnapshot.payments[0].status,'reversed');
  assert.equal(row.app_data.coreDataSnapshot.settlements[0].verificationStatus,'exception');
  assert.equal(row.app_data.coreDataSnapshot.bills[0].balanceDue,45);
  assert.equal((await apply('pending')).reason,'terminal_failure_preserved');
});
