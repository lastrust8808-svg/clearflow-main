import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { PlaidApi } from 'plaid';
import jwt from 'jsonwebtoken';
import { createHash,generateKeyPairSync } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('banking release boundaries: authorization, signed webhooks and delivery retries', async t => {
  const originalFetch=globalThis.fetch, originalCwd=process.cwd(), savedEnv={...process.env};
  const directory=await mkdtemp(path.join(tmpdir(),'clearflow-delivery-'));
  process.chdir(directory);
  process.env.NODE_ENV='test';process.env.PLAID_CLIENT_ID='test';process.env.PLAID_SECRET='test';
  delete process.env.CLEARFLOW_STORAGE_DATABASE_URL;delete process.env.CLEARFLOW_OWNER_DATABASE_URL;
  const originals=new Map();let providerCalls=0,authFailure=false,syncFailure=false;
  const stub=(name,fn)=>{originals.set(name,PlaidApi.prototype[name]);PlaidApi.prototype[name]=fn;};
  stub('itemPublicTokenExchange',async ({public_token})=>({data:{item_id:public_token,access_token:public_token}}));
  stub('accountsGet',async()=>({data:{accounts:[{account_id:'checking-provider',balances:{}}]}}));
  stub('authGet',async()=>{providerCalls++;if(authFailure)throw Object.assign(new Error('Invalid access token'),{response:{data:{error_code:'INVALID_ACCESS_TOKEN'}}});return {data:{accounts:[]}};});
  stub('signalEvaluate',async()=>{providerCalls++;return {data:{decision:'ACCEPT'}};});
  stub('transactionsGet',async()=>{providerCalls++;return {data:{transactions:[]}};});
  stub('transactionsSync',async ({access_token,cursor})=>{
    providerCalls++;
    if(syncFailure)throw new Error('Transient provider outage');
    return {data:{added:cursor?[]:[{transaction_id:'txn-'+access_token,account_id:'checking-provider',amount:25,date:'2026-10-24',name:'Test purchase'}],modified:[],removed:[],next_cursor:'cursor-'+access_token,has_more:false}};
  });
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
  stub('webhookVerificationKeyGet',async()=>({data:{key:publicKey.export({format:'jwk'})}}));
  globalThis.fetch=async (url,options)=>String(url).startsWith('https://openidconnect.googleapis.com/')
    ? {ok:true,json:async()=>({email:options.headers.Authorization.includes('alice')?'alice@example.com':'bob@example.com',email_verified:true})}
    : originalFetch(url,options);
  const {default:router}=await import('../../server/routes/plaid.js');
  const {loadAccountPlaidVault}=await import('../../server/services/accountStorage.js');
  const {decryptJson}=await import('../../server/utils/secureVault.js');
  const app=express();app.use('/webhook',express.raw({type:'application/json'}));app.use(express.json());app.use(router);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));for(const [name,fn]of originals)PlaidApi.prototype[name]=fn;globalThis.fetch=originalFetch;process.chdir(originalCwd);process.env=savedEnv;await rm(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(user,route,body)=>originalFetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+user,'x-clearflow-account-id':'google:'+user+'@example.com','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const connect=async itemId=>assert.equal((await request('alice','/exchange_public_token',{userId:'google:alice@example.com',public_token:itemId})).status,200);
  await connect('alice-owned');
  await t.test('foreign callers cannot reach provider operations using a known item ID',async()=>{
    const before=providerCalls;
    for(const route of ['/auth/get','/identity/get','/signal/evaluate','/transactions/sync'])assert.equal((await request('bob',route,{itemId:'alice-owned',accountId:'checking-provider',amount:25})).status,403,route);
    assert.equal((await request('bob','/transactions/alice-owned')).status,403);
    assert.equal(providerCalls,before);
  });
  await t.test('unexpected Auth failures never become successful connections',async()=>{
    authFailure=true;
    try {assert.equal((await request('alice','/exchange_public_token',{userId:'google:alice@example.com',public_token:'invalid-token-item'})).status,500);}finally{authFailure=false;}
    const connections=decryptJson((await loadAccountPlaidVault('google:alice@example.com')).encryptedPayload);
    assert.ok(!connections.some(item=>item.itemId==='invalid-token-item'));
  });
  await t.test('unsigned, altered and expired webhooks cannot change provider state',async()=>{
    const body=JSON.stringify({webhook_type:'TRANSACTIONS',webhook_code:'SYNC_UPDATES_AVAILABLE',item_id:'alice-owned'});
    const hash=createHash('sha256').update(body).digest('hex');
    const signed=jwt.sign({request_body_sha256:hash},privateKey,{algorithm:'ES256',keyid:'test-key'});
    const expired=jwt.sign({request_body_sha256:hash,iat:Math.floor(Date.now()/1000)-600},privateKey,{algorithm:'ES256',keyid:'test-key'});
    const before=providerCalls;
    for(const [payload,signature]of [[body,''],[body+' ',signed],[body,expired]]){
      const response=await originalFetch(base+'/webhook',{method:'POST',headers:{'Content-Type':'application/json','Plaid-Verification':signature},body:payload});
      assert.ok(response.status>=400);assert.equal(providerCalls,before);
    }
    assert.equal((await originalFetch(base+'/webhook',{method:'POST',headers:{'Content-Type':'application/json','Plaid-Verification':signed},body})).status,200);
    assert.equal(providerCalls,before+1);
  });
  await t.test('a provider outage does not advance a persisted cursor',async()=>{
    await connect('outage-item');syncFailure=true;
    try {assert.equal((await request('alice','/transactions/sync',{itemId:'outage-item'})).status,500);}finally{syncFailure=false;}
    const item=decryptJson((await loadAccountPlaidVault('google:alice@example.com')).encryptedPayload).find(item=>item.itemId==='outage-item');
    assert.equal(item.cursor,null);
    const recovered=await request('alice','/transactions/sync',{itemId:'outage-item'});
    assert.equal((await recovered.json()).added[0].transaction_id,'txn-outage-item');
  });
  await t.test('an unacknowledged sync delivery is replayed after the browser fails to save it',async()=>{
    await connect('lost-response-item');
    const first=await request('alice','/transactions/sync',{itemId:'lost-response-item'});
    assert.equal(first.status,200);const delivered=await first.json();
    // Do not persist these entries or acknowledge them. Retry as after a lost response or failed workspace save.
    const retry=await request('alice','/transactions/sync',{itemId:'lost-response-item'});
    assert.equal(retry.status,200);
    assert.deepEqual((await retry.json()).added,delivered.added,'An advanced cursor must not erase an unacknowledged delivery.');
  });
});
