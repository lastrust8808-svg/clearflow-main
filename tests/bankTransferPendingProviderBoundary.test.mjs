import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const transaction = (provider, connectionId, accountId, transactionId, amountCents, status = 'posted') => ({
  tenantId: 'tenant-a', provider, connectionId, accountId, transactionId,
  amountCents, currency: 'USD', postedDate: '2026-11-14', status,
  providerReference: 'shared-provider-reference',
});

test('pending evidence from another provider must not quarantine a valid Mercury pair', () => {
  const transactions = [
    transaction('mercury', 'mercury-1', 'checking', 'debit', -2500),
    transaction('mercury', 'mercury-1', 'savings', 'credit', 2500),
    transaction('plaid', 'plaid-1', 'external', 'pending', -2500, 'pending'),
  ];
  const original = structuredClone(transactions);
  const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.ambiguous, []);
  assert.equal(result.candidates[0].provider, 'mercury');
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(transactions, original);
});

test('pending evidence on another Mercury connection must not quarantine a valid pair', () => {
  const transactions = [
    transaction('mercury', 'mercury-1', 'checking', 'debit', -2500),
    transaction('mercury', 'mercury-1', 'savings', 'credit', 2500),
    transaction('mercury', 'mercury-2', 'checking', 'pending', 2500, 'pending'),
  ];
  const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.ambiguous, []);
});

test('pending evidence on the same connection must quarantine the pair', () => {
  const transactions = [
    transaction('mercury', 'mercury-1', 'checking', 'debit', -2500),
    transaction('mercury', 'mercury-1', 'savings', 'credit', 2500),
    transaction('mercury', 'mercury-1', 'reserve', 'pending', 2500, 'pending'),
  ];
  const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous.map((row) => row.transactionId), ['debit', 'credit']);
});
