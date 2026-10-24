import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import pg from 'pg';
import express from 'express';
import { PlaidApi } from 'plaid';
import ts from 'typescript';

const url = process.env.CLEARFLOW_STAGING_DATABASE_URL;
if (!url || new URL(url).pathname !== '/clearflow_staging') throw new Error('Isolated clearflow_staging database required.');
process.env.CLEARFLOW_STORAGE_DATABASE_URL = url;
process.env.CLEARFLOW_AUTH_DATABASE_URL = url;
process.env.CLEARFLOW_AUTH_SECRET = 'test-auth-secret-that-is-at-least-32-characters';
process.env.ENCRYPTION_KEY = 'test-vault-secret-that-is-at-least-32-characters';
process.env.NODE_ENV = 'production';
const migrations = ['001_storage_foundation.sql', '002_plaid_items_and_legacy_records.sql'];

// This suite requires a disposable database, never a deployment database.
test('committed storage survives a new process; HTTP isolation, grants and sessions fail closed', async t => {
  const client = new pg.Client({ connectionString: url }); await client.connect();
  t.after(() => client.end());
  for (let pass = 0; pass < 2; pass++) for (const file of migrations) {
    await client.query(readFileSync(new URL('../../server/db/versions/' + file, import.meta.url), 'utf8'));
  }
  const identity = await import('../../server/services/identityStore.js');
  await identity.prepareAuth();
  const { default: storage } = await import('../../server/routes/storage.js');
  const { default: b2b } = await import('../../server/routes/b2b.js');
  const { default: plaid } = await import('../../server/routes/plaid.js');
  const app = express(); app.use(express.json()); app.use('/storage', storage); app.use('/b2b', b2b); app.use('/plaid', plaid);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const users = {};
  for (const name of ['alice', 'bob']) {
    const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('hex');
    const digest = crypto.createHmac('sha256', process.env.CLEARFLOW_AUTH_SECRET).update(token).digest('hex');
    await client.query('INSERT INTO clearflow_identity(id,email) VALUES($1,$2)', [id, id + '@example.test']);
    await client.query("INSERT INTO clearflow_login_sessions(digest,user_id,expires) VALUES($1,$2,NOW()+INTERVAL '1 hour')", [digest,id]);
    users[name] = { id, token, account: 'local:' + id };
  }
  const req = async (user, route, method = 'GET', body, extra = {}) => fetch(`http://127.0.0.1:${server.address().port}${route}`, {
    method, headers: { Authorization: 'Bearer ' + user.token, 'Content-Type': 'application/json', ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const alice = users.alice, bob = users.bob;
  const workspace = '/storage/accounts/' + encodeURIComponent(alice.account) + '/app-data';
  const first = await req(alice, workspace, 'PUT', { user: { id: alice.id }, retained: 'original' });
  assert.equal(first.status, 200); const revision = (await first.json()).result.revision;
  assert.equal((await req(bob, workspace)).status, 403);
  assert.equal((await req(bob, workspace, 'PUT', { user: { id: bob.id } })).status, 403);
  const simultaneous = await Promise.all(['a', 'b'].map(value => req(alice, workspace, 'PUT', { user: { id: alice.id }, retained: value }, { 'If-Match': revision })));
  assert.deepEqual(simultaneous.map(r => r.status).sort(), [200,409]);
  const file = '/storage/accounts/' + encodeURIComponent(alice.account) + '/files';
  assert.equal((await req(alice, file, 'POST', { fileId: 'document', fileName: 'test.txt', base64Data: 'aGVsbG8=' })).status, 201);
  assert.equal((await req(bob, file + '/document')).status, 403);
  assert.equal((await req(alice, file + '/document')).status, 200);
  assert.equal((await req(alice, '/storage/accounts/' + encodeURIComponent(alice.account) + '/plaid-connections', 'PUT', { connections: [{ accessToken: 'untrusted' }] })).status, 403);
  const suffix = crypto.randomUUID(), payee = 'vendor-' + suffix, payer = 'payer-' + suffix;
  for (const [account,entity,permission] of [[alice.account,payee,'invoice_create'],[bob.account,payer,'payment_approve']]) {
    await client.query('INSERT INTO clearflow_entity_memberships(account_id,entity_id,permission,granted_by) VALUES($1,$2,$3,$4)', [account,entity,permission,'integration-test']);
  }
  const invoicePath = '/b2b/' + encodeURIComponent(alice.account) + '/invoices';
  assert.equal((await req(alice, invoicePath, 'POST', { id: suffix, payerEntityId: payer, payeeEntityId: payee, amount: 25.50 })).status, 201);
  const publication = await req(alice, invoicePath + '/' + suffix + '/publish', 'POST', {});
  assert.equal(publication.status, 201); const delivery = (await publication.json()).deliveryId;
  const payerPath = '/b2b/' + encodeURIComponent(bob.account) + '/deliveries/' + encodeURIComponent(delivery);
  assert.equal((await req(bob,payerPath)).status, 200);
  assert.equal((await req(bob,payerPath + '/acceptances','POST',{ accepted: true })).status, 201);
  assert.equal((await req(bob,payerPath + '/acceptances','POST',{ accepted: true })).status, 409);
  await client.query('UPDATE clearflow_entity_memberships SET revoked_at=NOW() WHERE account_id=$1', [bob.account]);
  assert.equal((await req(bob,payerPath)).status, 404);
  const { writePlaidItem, readPlaidItem } = await import('../../server/services/plaidItemStorage.js');
  const item = { itemId: 'item-' + suffix, userId: alice.account, accessToken: 'test-provider-secret', cursor: 'cursor-1', pendingAddedTransactions: [{ transaction_id: 'retained' }] };
  await writePlaidItem(item);
  const copy = await readPlaidItem(item.itemId); await writePlaidItem({ ...copy, cursor: 'cursor-2' });
  await assert.rejects(() => writePlaidItem({ ...copy, cursor: 'stale' }), /revision conflict/);
  const raw = await client.query('SELECT encrypted_payload FROM clearflow_plaid_items WHERE item_id=$1', [item.itemId]);
  assert.ok(!JSON.stringify(raw.rows).includes(item.accessToken));
  // Exercise the complete delivery -> accounting import -> durable save -> acknowledgement boundary.
  process.env.PLAID_CLIENT_ID='ci-test'; process.env.PLAID_SECRET='ci-test';
  const originalSync=PlaidApi.prototype.transactionsSync;
  PlaidApi.prototype.transactionsSync=async()=>({data:{added:[],modified:[],removed:[],next_cursor:'after-sync',has_more:false}});
  t.after(()=>{PlaidApi.prototype.transactionsSync=originalSync;});
  const deliveryItemId='delivery-'+suffix;
  await writePlaidItem({itemId:deliveryItemId,userId:alice.account,accessToken:'ci-only-access',pendingAddedTransactions:[
    {transaction_id:'checking-txn',account_id:'provider-checking',amount:25,date:'2026-10-24',name:'Checking purchase'},
    {transaction_id:'savings-txn',account_id:'provider-savings',amount:50,date:'2026-10-24',name:'Savings purchase'},
  ]});
  const bankReq=(user,route,body)=>req(user,'/plaid'+route,'POST',body,{'x-clearflow-account-id':user.account});
  const deliveryResponse=await bankReq(alice,'/transactions/sync',{itemId:deliveryItemId});
  assert.equal(deliveryResponse.status,200);const batch=await deliveryResponse.json();assert.ok(batch.deliveryId);
  assert.deepEqual(await (await bankReq(alice,'/transactions/sync',{itemId:deliveryItemId})).json(),batch);
  assert.equal((await bankReq(bob,'/transactions/ack',{itemId:deliveryItemId,deliveryId:batch.deliveryId})).status,403);
  assert.equal((await bankReq(alice,'/transactions/ack',{itemId:deliveryItemId,deliveryId:batch.deliveryId})).status,409,'Unsaved deliveries cannot be acknowledged.');
  const bankSource=readFileSync(new URL('../../src/services/bankFeed.service.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(bankSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const {syncPlaidItemToLedger}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
  const bankCore={bankAccounts:['checking','savings'].map((name,index)=>({id:name,entityId:'entity-'+index,accountName:name,institutionName:'Test bank',currency:'USD',accountType:name,status:'active',plaidItemId:deliveryItemId,connectionType:'plaid_connected',connectedProfile:{externalAccountId:'provider-'+name}})),bankFeedEntries:[],bankFeedRules:[],reconciliations:[],ledgerAccounts:[],transactions:[],journalEntries:[],tokens:[]};
  const imported=syncPlaidItemToLedger(bankCore,deliveryItemId,batch);
  assert.deepEqual(imported.bankFeedEntries.map(entry=>[entry.bankAccountId,entry.externalTransactionId]).sort(),[['checking','checking-txn'],['savings','savings-txn']]);
  const current=await (await req(alice,workspace)).json();
  const retainedWorkspace={...current.appData,coreDataSnapshot:imported};
  assert.equal((await req(alice,workspace,'PUT',retainedWorkspace,{'If-Match':'0'})).status,409);
  assert.equal((await bankReq(alice,'/transactions/ack',{itemId:deliveryItemId,deliveryId:batch.deliveryId})).status,409);
  assert.equal((await req(alice,workspace,'PUT',retainedWorkspace,{'If-Match':current.version})).status,200);
  const updatedItem=await readPlaidItem(deliveryItemId);
  updatedItem.pendingAddedTransactions=[{transaction_id:'later-txn',account_id:'provider-checking',amount:5,date:'2026-10-24',name:'Later purchase'}];
  await writePlaidItem(updatedItem);
  assert.equal((await bankReq(alice,'/transactions/ack',{itemId:deliveryItemId,deliveryId:batch.deliveryId})).status,200);
  assert.equal((await bankReq(alice,'/transactions/ack',{itemId:deliveryItemId,deliveryId:batch.deliveryId})).status,200,'A lost acknowledgement response is safe to retry.');
  const later=await (await bankReq(alice,'/transactions/sync',{itemId:deliveryItemId})).json();
  assert.notEqual(later.deliveryId,batch.deliveryId);assert.equal(later.added[0].transaction_id,'later-txn');
  assert.equal((await bankReq(alice,'/transactions/ack',{itemId:deliveryItemId,deliveryId:later.deliveryId})).status,409,'An earlier receipt cannot acknowledge later changes.');
  const deliveryRestart=execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import { readPlaidItem } from './server/services/plaidItemStorage.js';
    import { loadAccountAppData } from './server/services/accountStorage.js';
    const [itemId,accountId,deliveryId]=process.argv.slice(1);
    const item=await readPlaidItem(itemId);assert.equal(item.delivery.deliveryId,deliveryId);
    assert.equal(item.delivery.added[0].transaction_id,'later-txn');
    const workspace=await loadAccountAppData(accountId);assert.equal(workspace.coreDataSnapshot.bankFeedEntries.length,2);
    console.log('delivery restart passed');process.exit(0);
  `,deliveryItemId,alice.account,later.deliveryId],{encoding:'utf8',timeout:20000});
  assert.match(deliveryRestart,/delivery restart passed/);
  // Load through fresh application modules in a new process: no caches or legacy files.
  const child = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { loadAccountAppData, loadAccountDocumentFile } from './server/services/accountStorage.js';
    import { readPlaidItem } from './server/services/plaidItemStorage.js';
    const [account,itemId] = process.argv.slice(1);
    assert.equal((await loadAccountAppData(account)).user.id, account.slice(6));
    assert.equal((await loadAccountDocumentFile(account,'document')).base64Data,'aGVsbG8=');
    const item = await readPlaidItem(itemId);
    assert.equal(item.cursor,'cursor-2'); assert.equal(item.accessToken,'test-provider-secret');
    assert.equal(item.pendingAddedTransactions[0].transaction_id,'retained');
    console.log('fresh-process retention passed'); process.exit(0);
  `, alice.account,item.itemId], { encoding: 'utf8', timeout: 20000 });
  assert.match(child, /retention passed/);
  await identity.revokeToken(alice.token); assert.equal((await req(alice,workspace)).status, 401);
  await client.query("UPDATE clearflow_login_sessions SET expires=NOW()-INTERVAL '1 second' WHERE user_id=$1", [bob.id]);
  assert.equal((await req(bob,'/storage/accounts/' + encodeURIComponent(bob.account) + '/app-data')).status,401);
});
