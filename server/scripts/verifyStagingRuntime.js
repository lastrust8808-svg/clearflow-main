// Staging-only actual HTTP/runtime verification. Creates and removes only its own fixtures.
import pg from 'pg';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const url=process.env.CLEARFLOW_STAGING_DATABASE_URL;
if(!url || new URL(url).pathname!=='/clearflow_staging') throw new Error('Isolated staging database required.');
if((process.env.CLEARFLOW_AUTH_SECRET||'').length<32) throw new Error('Staging authentication secret required.');
const db=new pg.Client({connectionString:url,connectionTimeoutMillis:10000});
const users=['alice','bob'].map(name=>{const id=crypto.randomUUID();return{id,account:'local:'+id,email:`runtime-${name}-${id}@example.test`,token:crypto.randomBytes(32).toString('hex')};});
const port=18081,base=`http://127.0.0.1:${port}`;
let server,serverExit;
async function stop(){if(server && server.exitCode===null && server.signalCode===null){server.kill('SIGTERM');await serverExit;}server=null;}
async function start(){
 server=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'production',PORT:String(port),CLEARFLOW_STORAGE_DATABASE_URL:url,CLEARFLOW_AUTH_DATABASE_URL:url,CLEARFLOW_OWNER_DATABASE_URL:'',CLEARFLOW_OWNER_EMAIL:''},stdio:'ignore'});
 serverExit=new Promise(resolve=>server.once('exit',resolve));
 let spawnError;server.once('error',error=>{spawnError=error;});
 for(let i=0;i<100;i++){
  if(spawnError || server.exitCode!==null)throw new Error('Staging server exited before readiness.');
  try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});if(r.status===200)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new Error('Staging HTTP health did not become ready.');
}
function request(user,path,method='GET',body){return fetch(base+path,{method,headers:{...(user?{Authorization:'Bearer '+user.token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
let connected=false;
try{
 await db.connect();connected=true;
 for(const user of users){
  await db.query('INSERT INTO clearflow_identity(id,email) VALUES($1,$2)',[user.id,user.email]);
  const digest=crypto.createHmac('sha256',process.env.CLEARFLOW_AUTH_SECRET).update(user.token).digest('hex');
  await db.query("INSERT INTO clearflow_login_sessions(digest,user_id,expires) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[digest,user.id]);
 }
 const [alice,bob]=users,path='/api/storage/accounts/'+encodeURIComponent(alice.account)+'/app-data';
 await start();
 assert.equal((await request(null,path)).status,401);
 const saved=await request(alice,path,'PUT',{user:{id:alice.id},retained:'staging-restart-evidence'});assert.equal(saved.status,200);
 assert.equal((await request(bob,path)).status,403);
 assert.equal((await request(bob,path,'PUT',{user:{id:bob.id},retained:'foreign-overwrite'})).status,403);
 await stop();await start();
 const retained=await request(alice,path);assert.equal(retained.status,200);
 assert.equal((await retained.json()).appData.retained,'staging-restart-evidence');
 await db.query('UPDATE clearflow_login_sessions SET revoked=TRUE WHERE user_id=$1',[alice.id]);
 assert.ok([401,403].includes((await request(alice,path)).status));
 console.log('STAGING_RUNTIME_PASS: production health, authenticated save, foreign read/write denial, committed restart retention, and session revocation verified.');
}finally{
 await stop();
 if(connected){
  await db.query('DELETE FROM clearflow_account_snapshots WHERE account_id=ANY($1::text[])',[users.map(u=>u.account)]);
  await db.query('DELETE FROM clearflow_login_sessions WHERE user_id=ANY($1::uuid[])',[users.map(u=>u.id)]);
  await db.query('DELETE FROM clearflow_identity WHERE id=ANY($1::uuid[])',[users.map(u=>u.id)]);
 }
 await db.end();
 console.log('Staging runtime fixtures cleaned up.');
}
