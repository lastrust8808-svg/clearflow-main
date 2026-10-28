import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the actual connection callback, substituting only its React setters and
// surrounding page services. Do not duplicate its account-mapping implementation.
const source=ts.createSourceFile('AccountingPage.tsx',readFileSync(new URL('../../src/components/pages/AccountingPage.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let callback;
const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='handlePlaidConnected')callback=node.initializer.getText(source);ts.forEachChild(node,visit);};
visit(source);assert.ok(callback,'Connection callback must be found.');
const compiled=ts.transpileModule('const callback = '+callback+'; return callback;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const makeCallback=new Function('setData','buildNextFeedStartDate','ensureAccountingOwnerEntity','resolveDefaultFundsRightsClassification','selectedBankFeedAccountId','setIsPlaidModalOpen','setSelectedBankFeedAccountId','returnToAccountingDashboard',compiled);
function reconnect(mask){
  let state={entities:[{id:'owner-entity'}],bankAccounts:[{id:'checking',entityId:'owner-entity',accountName:'Existing account',institutionName:'Test institution'}]};
  const callback=makeCallback(update=>{state=update(state);},()=> '2026-10-24',data=>({entity:data.entities[0],entities:data.entities,created:false}),()=> 'deposit','checking',()=>{},()=>{},()=>{});
  callback({authResponse:null,identityData:{accounts:[]},identityMatchScores:{legal_name:{score:0}},itemId:'optional-auth-item',linkedAccounts:[{accountId:'provider-investment',name:'Investment account',type:'investment',subtype:'brokerage',...(mask?{mask}:{})}]});
  return state;
}
test('a valid optional-Auth response with an account mask reconnects successfully',()=>{
  assert.equal(reconnect('1234').bankAccounts[0].connectionType,'plaid_connected');
});
test('a valid optional-Auth response without a mask does not crash the connection callback',()=>{
  assert.doesNotThrow(()=>reconnect());
});
