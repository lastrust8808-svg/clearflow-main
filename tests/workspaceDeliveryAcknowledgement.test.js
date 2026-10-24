import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

test('browser acknowledges delivery only after a successful durable save and retries failed acknowledgements',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'clearflow-save-ack-'));
 await writeFile(path.join(directory,'package.json'),'{"type":"module"}');
 for(const name of ['accountPersistence','plaid','storageSession','runtimeConfig']){
  const source=await readFile(new URL('../src/services/'+name+'.service.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+\.service)'/g,"from '$1.js'");
  await writeFile(path.join(directory,name+'.service.js'),compiled);
 }
 const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
 globalThis.window={process:{env:{VITE_API_BASE_URL:'https://api.example.test'}},localStorage:{getItem:()=>null}};
 t.after(async()=>{globalThis.fetch=originalFetch;globalThis.window=originalWindow;await rm(directory,{recursive:true,force:true});});
 const {setStorageAccessToken}=await import(pathToFileURL(path.join(directory,'storageSession.service.js')));setStorageAccessToken('verified-token','local:alice');
 const {saveAccountAppData}=await import(pathToFileURL(path.join(directory,'accountPersistence.service.js')));
 const data={user:{id:'alice'},entities:[],coreDataSnapshot:{bankFeedDeliveryReceipts:[{itemId:'item-1',deliveryId:'delivery-1'}]}};
 let rejectSave=true,rejectAck=false,revision=1,calls=[];
 globalThis.fetch=async(url,init)=>{
  calls.push({url,init});
  if(url.endsWith('/transactions/ack'))return Response.json(rejectAck?{error:'temporarily unavailable'}:{acknowledged:true},{status:rejectAck?503:200});
  return Response.json(rejectSave?{error:'revision conflict'}:{success:true,result:{revision:revision++}},{status:rejectSave?409:200});
 };
 await assert.rejects(()=>saveAccountAppData('local:alice',data),/Failed to save/);
 assert.equal(calls.length,1,'Failed workspace writes must not acknowledge a bank delivery.');
 calls=[];rejectSave=false;rejectAck=true;
 await saveAccountAppData('local:alice',data);
 assert.equal(calls.length,2);assert.equal(calls[0].init.method,'PUT');assert.ok(calls[1].url.endsWith('/transactions/ack'));
 calls=[];rejectAck=false;await saveAccountAppData('local:alice',data);
 assert.equal(calls[0].init.headers['If-Match'],'1','The successful save revision survives an acknowledgement failure.');
 assert.deepEqual(JSON.parse(calls[1].init.body),{itemId:'item-1',deliveryId:'delivery-1'});
});
