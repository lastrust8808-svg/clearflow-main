import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (transactionId, accountId, amountCents, currency, status = 'posted') => ({
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'connection-a',
  accountId, transactionId, amountCents, currency,
  postedDate: '2026-11-05', status, providerReference: 'shared-reference',
});

test('cross-currency pending evidence quarantines a reused connection reference', () => {
  const transactions = [
    row('debit', 'checking', -1500, 'USD'),
    row('credit', 'savings', 1500, 'USD'),
    row('pending-eur', 'foreign', 1500, 'EUR', 'pending'),
  ];
  const snapshot = structuredClone(transactions);
  const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous.map(({ transactionId }) => transactionId), ['debit', 'credit']);
  assert.deepEqual(transactions, snapshot);
});

test('a separate provider reference does not quarantine a valid USD pair', () => {
  const transactions = [
    row('debit', 'checking', -1500, 'USD'),
    row('credit', 'savings', 1500, 'USD'),
    { ...row('pending-eur', 'foreign', 1500, 'EUR', 'pending'), providerReference: 'other-reference' },
  ];
  const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});
