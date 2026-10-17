import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPaymentStatus, reconcileBankTransaction } from '../server/services/paymentControls.js';

test('approval does not imply paid or reconciled', () => {
  assert.deepEqual(classifyPaymentStatus({ id: 'req-1', status: 'approved' }, []), {
    state: 'processing', reconciled: false, transactionId: null,
  });
});
test('provider transaction must belong to approval request', () => {
  const result = classifyPaymentStatus({ id: 'req-1', status: 'approved' }, [{ id: 'tx-1', requestId: 'other', status: 'completed' }]);
  assert.equal(result.state, 'processing');
});
test('matching completed provider transaction is bank confirmed but not reconciled', () => {
  const result = classifyPaymentStatus({ id: 'req-1', status: 'approved' }, [{ id: 'tx-1', requestId: 'req-1', status: 'completed' }]);
  assert.equal(result.state, 'bank_confirmed');
  assert.equal(result.reconciled, false);
});
test('returned transaction takes precedence over completed transaction', () => {
  const result = classifyPaymentStatus({ id: 'req-1', status: 'approved' }, [
    { id: 'tx-1', requestId: 'req-1', status: 'completed' },
    { id: 'tx-2', requestId: 'req-1', status: 'returned' },
  ]);
  assert.equal(result.state, 'failed');
});
test('reconciliation requires same account, explicit link, amount, and bank posting', () => {
  const bank = { id: 'bank-1', accountId: 'entity-1', amount: 45, status: 'posted' };
  const ledger = { id: 'ledger-1', accountId: 'entity-1', bankTransactionId: 'bank-1', amount: 45 };
  assert.equal(reconcileBankTransaction({ bankTransaction: bank, ledgerEntry: ledger, expectedAccountId: 'entity-1' }).matched, true);
  assert.equal(reconcileBankTransaction({ bankTransaction: bank, ledgerEntry: ledger, expectedAccountId: 'entity-2' }).matched, false);
  assert.equal(reconcileBankTransaction({ bankTransaction: bank, ledgerEntry: { ...ledger, amount: 46 }, expectedAccountId: 'entity-1' }).matched, false);
  assert.equal(reconcileBankTransaction({ bankTransaction: bank, ledgerEntry: { ...ledger, bankTransactionId: 'other' }, expectedAccountId: 'entity-1' }).matched, false);
  assert.equal(reconcileBankTransaction({ bankTransaction: { ...bank, status: 'pending' }, ledgerEntry: ledger, expectedAccountId: 'entity-1' }).matched, false);
});

test('a sent bank transaction is not yet bank confirmed', () => {
  const result = classifyPaymentStatus({ id: 'req-1', status: 'approved' }, [{ id: 'tx-1', requestId: 'req-1', status: 'sent' }]);
  assert.equal(result.state, 'processing');
  assert.equal(result.reconciled, false);
});
test('a posted bank transaction can be confirmed but is not automatically reconciled', () => {
  const result = classifyPaymentStatus({ id: 'req-1', status: 'approved' }, [{ id: 'tx-1', requestId: 'req-1', status: 'posted' }]);
  assert.equal(result.state, 'bank_confirmed');
  assert.equal(result.reconciled, false);
});
