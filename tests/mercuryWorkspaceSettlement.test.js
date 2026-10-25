import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=ts.createSourceFile('ownerDatabase.js',readFileSync(new URL('../server/services/ownerDatabase.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const functions=new Map();
for(const node of source.statements)if(ts.isFunctionDeclaration(node)&&node.name)functions.set(node.name.text,node.getText(source).replace(/^export /,''));
async function update(transaction,approvalRequest={id:'request-1',status:'approved'}) {
 let retained;
 const execution={executionProvider:'mercury',executionReference:'request-1'};
 const snapshot={settlements:[{id:'settlement-1',...execution,grossAmount:45}],payments:[{id:'payment-1',amount:45,status:'initiated',settlementExecution:execution,linkedBillIds:['bill-1']}],bills:[{id:'bill-1',balanceDue:45,status:'open',linkedPaymentIds:['payment-1'],linkedObligationId:'obligation-1'}],invoices:[],obligations:[{id:'obligation-1',amount:45,status:'open'}],journalEntries:[{id:'journal-1',status:'draft',linkedSettlementIds:['settlement-1']}],transactions:[{id:'ledger-1',status:'pending',linkedSettlementId:'settlement-1'}],vendors:[]};
 const apply=new Function('isConfiguredOwnerAccount','loadOwnerWorkspace','saveOwnerWorkspace',functions.get('mapMercuryProviderState')+'\n'+functions.get('applyMercuryProviderUpdateToOwnerWorkspace')+'\nreturn applyMercuryProviderUpdateToOwnerWorkspace;')(()=>true,async()=>({version:1,app_data:{coreDataSnapshot:snapshot}}),async args=>{retained=args.appData.coreDataSnapshot;return{version:2};});
 const result=await apply({accountId:'owner',requestId:'request-1',approvalRequest,transaction});return{result,retained};
}
test('sent payment cannot pay bills, discharge obligations or post the ledger without reconciliation',async()=>{
 const {retained}=await update({id:'tx-1',requestId:'request-1',status:'sent',amount:45});
 assert.equal(retained.payments[0].status,'initiated');
 assert.equal(retained.bills[0].balanceDue,45);assert.equal(retained.bills[0].status,'open');
 assert.equal(retained.obligations[0].amount,45);assert.equal(retained.obligations[0].status,'open');
 assert.equal(retained.journalEntries[0].status,'draft');assert.equal(retained.transactions[0].status,'pending');
});
test('provider evidence belonging to another request cannot mutate the workspace',async()=>{
 const {result,retained}=await update({id:'tx-foreign',requestId:'other',status:'sent'});
 assert.equal(result.applied,false);assert.equal(retained,undefined);
});
test('a returned payment stays an exception without reducing balances',async()=>{
 const {retained}=await update({id:'tx-1',requestId:'request-1',status:'reversed'});
 assert.equal(retained.payments[0].status,'reversed');assert.equal(retained.bills[0].balanceDue,45);
 assert.equal(retained.settlements[0].verificationStatus,'exception');
});
