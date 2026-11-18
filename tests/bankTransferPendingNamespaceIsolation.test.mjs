import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const transaction = (accountId, transactionId, amountCents, overrides = {}) => ({
  tenantId: 'tenant-a',
  provider: 'plaid',
  connectionId: 'item-a',
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-18',
  status: 'posted',
  providerReference: 'reused-provider-reference',
  ...overrides,
});

test('pending reference evidence is isolated to its provider connection', () => {
  const posted = [
    transaction('checking', 'debit', -2500),
    transaction('savings', 'credit', 2500),
  ];
  const foreignPending = transaction('reserve', 'pending', 2500, {
    status: 'pending',
    connectionId: 'item-b',
  });
  const result = proposeBankTransferCandidates({
    tenantId: 'tenant-a',
    transactions: [...posted, foreignPending],
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);

  const sameConnection = proposeBankTransferCandidates({
    tenantId: 'tenant-a',
    transactions: [...posted, { ...foreignPending, connectionId: 'item-a' }],
  });
  assert.deepEqual(sameConnection.candidates, []);
  assert.deepEqual(sameConnection.ambiguous.map((row) => row.transactionId), ['debit', 'credit']);
});

test('provider namespace also isolates pending collision evidence', () => {
  const result = proposeBankTransferCandidates({
    tenantId: 'tenant-a',
    transactions: [
      transaction('checking', 'debit', -2500),
      transaction('savings', 'credit', 2500),
      transaction('reserve', 'pending', 2500, {
        provider: 'mercury',
        status: 'pending',
      }),
    ],
  });
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.ambiguous, []);
});
