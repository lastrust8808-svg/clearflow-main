import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/components/plaid-link-modal/PlaidLinkModal.tsx',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
function harness({saved={token:'original'},account='alice'}={}) {
 const slots=[],effects=[];let index=0,config,exchanges=0,opens=0,created=0,connected=0,cleared=0;
 const refSlots=[];let refIndex=0;
 const bindings={React:{createElement:()=>null},useState:initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=v;}];},useRef:initial=>{const i=refIndex++;return refSlots[i]??(refSlots[i]={current:initial});},useCallback:f=>f,useEffect:f=>effects.push(f),useAuth:()=>({currentUser:{id:account,name:account}}),bankingSession:()=>({accountId:account}),isPlaidOAuthReturn:()=>true,readPlaidLinkSession:()=>saved,savePlaidLinkSession:()=>{},clearPlaidLinkSession:()=>{cleared++;},plaidReceivedRedirectUri:()=> 'https://app.test/return?oauth_state_id=state',plaidService:{createLinkToken:async()=>{created++;return{link_token:'new'};},exchangePublicToken:async()=>{exchanges++;return{linkedAccounts:[]};}},usePlaidLink:c=>{config=c;return{ready:Boolean(c.token),open:()=>{opens++;}};}};
 const exports={};new Function('exports',...Object.keys(bindings),compiled)(exports,...Object.values(bindings));
 const render=()=>{index=0;refIndex=0;effects.length=0;exports.PlaidLinkModal({onClose:()=>{},onConnected:()=>{connected++;}});};
 return {async mount(){render();for(const f of [...effects])f();await Promise.resolve();render();effects.at(-1)();},get config(){return config;},get result(){return{exchanges,opens,created,connected,cleared};},switchAccount(next){account=next;},slots};
}
test('actual modal resumes the saved token and opens Link without creating a new token',async()=>{
 const h=harness();await h.mount();assert.equal(h.config.token,'original');assert.equal(h.config.receivedRedirectUri,'https://app.test/return?oauth_state_id=state');assert.equal(h.result.created,0);assert.equal(h.result.opens,1);
 await h.config.onSuccess('public');assert.equal(h.result.exchanges,1);assert.equal(h.result.connected,1);assert.equal(h.result.cleared,1);
});
test('missing or mismatched OAuth session cannot open or exchange through the modal',async()=>{
 const h=harness({saved:null});await h.mount();assert.equal(h.result.opens,0);assert.equal(h.result.created,0);
 await h.config.onSuccess('public');assert.equal(h.result.exchanges,0);
});
test('switching authenticated accounts before Link success cannot exchange the prior token',async()=>{
 const h=harness();await h.mount();h.switchAccount('bob');await h.config.onSuccess('public');assert.equal(h.result.exchanges,0);
});
test('duplicate success callbacks exchange once and an immediate exit cannot clear an in-flight session',async()=>{
 const h=harness();await h.mount();
 const first=h.config.onSuccess('public');
 h.config.onExit(null,{});
 assert.equal(h.result.cleared,0,'Exit must not cancel the active exchange before a rerender.');
 await Promise.all([first,h.config.onSuccess('same-public')]);
 assert.equal(h.result.exchanges,1);assert.equal(h.result.connected,1);assert.equal(h.result.cleared,1);
});
