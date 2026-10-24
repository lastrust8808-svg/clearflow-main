import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

test('browser banking sends the verified account and bearer; missing authentication never creates demo connections', async t => {
  const directory = await mkdtemp(path.join(tmpdir(),'clearflow-browser-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  await writeFile(path.join(directory,'package.json'),'{"type":"module"}');
  for (const name of ['plaid','runtimeConfig','storageSession']) {
    const source = await readFile(new URL('../src/services/'+name+'.service.ts',import.meta.url),'utf8');
    const compiled = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
      .replaceAll("'./runtimeConfig.service'","'./runtimeConfig.service.js'")
      .replaceAll("'./storageSession.service'","'./storageSession.service.js'");
    await writeFile(path.join(directory,name+'.service.js'),compiled);
  }
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  globalThis.window = { location:{ origin:'https://app.example.test' }, process:{ env:{ VITE_API_BASE_URL:'https://api.example.test' } }, localStorage:{ getItem:()=>null,setItem:()=>{} } };
  t.after(() => { globalThis.window=originalWindow;globalThis.fetch=originalFetch; });
  const { plaidService } = await import(pathToFileURL(path.join(directory,'plaid.service.js')));
  const { setStorageAccessToken } = await import(pathToFileURL(path.join(directory,'storageSession.service.js')));
  let calls = [];
  globalThis.fetch = async (url,init) => { calls.push({url,init}); return new Response(JSON.stringify({link_token:'provider-link'}),{headers:{'Content-Type':'application/json'}}); };
  await assert.rejects(()=>plaidService.createLinkToken('client-asserted-id'),/Sign in/);
  assert.equal(calls.length,0);
  setStorageAccessToken('verified-session','local:verified-user');
  assert.equal((await plaidService.createLinkToken('client-asserted-id')).link_token,'provider-link');
  assert.equal(calls[0].init.headers.get('Authorization'),'Bearer verified-session');
  assert.equal(calls[0].init.headers.get('x-clearflow-account-id'),'local:verified-user');
  assert.equal(JSON.parse(calls[0].init.body).userId,'local:verified-user');
  calls=[];
  globalThis.fetch=async (url,init)=>{calls.push({url,init});return new Response('{"error":"unavailable"}',{status:503,headers:{'Content-Type':'application/json'}});};
  await assert.rejects(()=>plaidService.exchangePublicToken('once','wrong','Alice'),/unavailable/);
  assert.equal(calls.length,1,'Do not replay one-use exchange tokens against fallback origins.');
  setStorageAccessToken(null);
  await assert.rejects(()=>plaidService.getTransactions('item'),/Sign in/);
});
