import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/services/bankFeed.service.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { syncBankFeedToLedger } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
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
