import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/services/bankFeed.service.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { syncBankFeedToLedger, syncPlaidItemToLedger } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const fixture = () => ({
  bankAccounts: ['checking','savings'].map((name,index) => ({ id:name, entityId:'entity-' + index, accountName:name,
    institutionName:'Test institution', accountType:name, currency:'USD', status:'active', connectionType:'plaid_connected',
    plaidItemId:'shared-provider-item', connectedProfile:{ externalAccountId:'provider-' + name }, autoCategorizeFeedTransactions:false })),
  bankFeedEntries:[],bankFeedRules:[],reconciliations:[],ledgerAccounts:[],transactions:[],journalEntries:[],tokens:[],
});
const transaction = (id,account_id,amount=25) => ({ transaction_id:id, account_id,amount,date:'2026-10-24',name:'Test bank transaction',pending:false });

test('a shared Plaid item never imports another linked account into the selected books', () => {
  const result = syncBankFeedToLedger({ data:fixture(),bankAccountId:'checking',plaidTransactions:[
    transaction('checking-1','provider-checking'),transaction('savings-1','provider-savings'),
  ] });
  assert.deepEqual(result.bankFeedEntries.map(entry=>entry.externalTransactionId),['checking-1']);
});

test('replayed bank transactions do not create duplicate feed entries', () => {
  const payload = { bankAccountId:'checking',plaidTransactions:[transaction('checking-1','provider-checking')] };
  const once = syncBankFeedToLedger({ data:fixture(),...payload });
  const twice = syncBankFeedToLedger({ data:once,...payload });
  assert.equal(twice.bankFeedEntries.length,1);
  assert.equal(twice.reconciliations.length,1);
});

test('duplicate transaction IDs inside one provider response are imported only once', () => {
  const entry = transaction('duplicate','provider-checking');
  const result = syncBankFeedToLedger({ data:fixture(),bankAccountId:'checking',plaidTransactions:[entry,{...entry}] });
  assert.equal(result.bankFeedEntries.length,1);
});

test('pending bank activity is retained for review and never auto-posted',()=>{
  const data=fixture();
  data.bankAccounts[0].autoCategorizeFeedTransactions=true;data.bankAccounts[0].linkedLedgerAccountId='checking-ledger';
  data.ledgerAccounts=[{id:'checking-ledger',entityId:'entity-0',name:'Checking',accountType:'asset',currency:'USD',balance:0}];
  const result=syncBankFeedToLedger({data,bankAccountId:'checking',plaidTransactions:[{...transaction('pending-1','provider-checking'),pending:true}]});
  assert.equal(result.bankFeedEntries.length,1);assert.equal(result.transactions.length,0);assert.equal(result.journalEntries.length,0);
  assert.equal(result.bankFeedEntries[0].verificationStatus,'pending');
});

test('malformed provider amounts are rejected before changing accounting data',()=>{
  for(const amount of [NaN,Infinity,-Infinity])assert.throws(()=>syncBankFeedToLedger({data:fixture(),bankAccountId:'checking',plaidTransactions:[transaction('bad-amount','provider-checking',amount)]}),/amount/i);
});

test('item-wide import partitions both accounts and saves one receipt without cross-posting',()=>{
 const result=syncPlaidItemToLedger(fixture(),'shared-provider-item',{itemId:'shared-provider-item',deliveryId:'batch-1',added:[transaction('checking-1','provider-checking'),transaction('savings-1','provider-savings')],modified:[],removedTransactionIds:[]});
 assert.deepEqual(result.bankFeedEntries.map(entry=>[entry.bankAccountId,entry.entityId,entry.externalTransactionId]).sort(),[['checking','entity-0','checking-1'],['savings','entity-1','savings-1']]);
 assert.deepEqual(result.bankFeedDeliveryReceipts,[{itemId:'shared-provider-item',deliveryId:'batch-1'}]);
 const replay=syncPlaidItemToLedger(result,'shared-provider-item',{deliveryId:'batch-1',added:[transaction('checking-1','provider-checking')],modified:[],removedTransactionIds:[]});
 assert.equal(replay.bankFeedEntries.length,2);
});
test('unknown or ambiguous account mappings prevent acknowledgement of an incomplete import',()=>{
 const sync={deliveryId:'batch-1',added:[transaction('unknown','unmapped-provider')],modified:[],removedTransactionIds:[]};
 const data=fixture();assert.throws(()=>syncPlaidItemToLedger(data,'shared-provider-item',sync),/Connect every account/);
 assert.equal(data.bankFeedEntries.length,0);assert.equal(data.bankFeedDeliveryReceipts,undefined);
 data.bankAccounts[1].connectedProfile.externalAccountId='provider-checking';
 assert.throws(()=>syncPlaidItemToLedger(data,'shared-provider-item',sync),/ambiguous/);
});

test('bank rules cannot auto-post into a different entity ledger',()=>{
 const data=fixture();data.bankAccounts[0].linkedLedgerAccountId='bank-ledger';
 data.ledgerAccounts=[{id:'bank-ledger',entityId:'entity-0',currency:'USD',name:'Checking',accountType:'asset',balance:0},{id:'foreign-ledger',entityId:'entity-1',currency:'USD',name:'Other entity expense',accountType:'expense',balance:0}];
 data.bankFeedRules=[{id:'bad-rule',entityId:'entity-0',active:true,direction:'any',defaultLedgerAccountId:'foreign-ledger',autoPost:true}];
 assert.throws(()=>syncBankFeedToLedger({data,bankAccountId:'checking',plaidTransactions:[transaction('txn','provider-checking')]}),/same entity/);
 assert.equal(data.transactions.length,0);assert.equal(data.journalEntries.length,0);
});
