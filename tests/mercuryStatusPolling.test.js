import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {classifyPaymentStatus,selectPaymentTransaction} from '../server/services/paymentControls.js';
const source=ts.createSourceFile('mercury.js',readFileSync(new URL('../server/routes/mercury.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
let handler;
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(source)==='router.get'&&node.arguments[0]?.text==='/payment-status/:requestId')handler=node.arguments.at(-1).getText(source);ts.forEachChild(node,visit);}visit(source);assert.ok(handler);
test('actual polling handler passes the failure transaction to durable update in either provider order',async()=>{
 const sent={id:'tx-sent',requestId:'req-1',status:'sent'},reversed={id:'tx-return',requestId:'req-1',status:'reversed'};
 for(const transactions of [[sent,reversed],[reversed,sent]]){
  let update,response;
  const callback=new Function('isMercuryExecutionConfigured','getMercuryPaymentStatus','getOwnerAccountId','classifyPaymentStatus','selectPaymentTransaction','applyMercuryProviderUpdateToOwnerWorkspace','return '+handler)(()=>true,async()=>({approvalRequest:{id:'req-1',status:'approved'},transactions}),()=> 'owner',classifyPaymentStatus,selectPaymentTransaction,async args=>{update=args;return{applied:true};});
  const res={status(code){assert.equal(code,200);return this;},json(value){response=value;}};
  await callback({params:{requestId:'req-1'}},res);
  assert.equal(update.transaction.id,'tx-return');assert.equal(response.paymentLifecycle.state,'failed');assert.equal(response.paymentLifecycle.transactionId,update.transaction.id);
 }
});
test('transaction selection rejects foreign and identifierless evidence and treats conflicting progress conservatively',()=>{
 assert.equal(selectPaymentTransaction('req-1',[{id:'foreign',requestId:'req-2',status:'reversed'},{requestId:'req-1',status:'completed'}]),null);
 const result=classifyPaymentStatus({id:'req-1',status:'approved'},[{id:'complete',requestId:'req-1',status:'completed'},{id:'pending',requestId:'req-1',status:'pending'}]);
 assert.equal(result.state,'processing');assert.equal(result.reconciled,false);
});
