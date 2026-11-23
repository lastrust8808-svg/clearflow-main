import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (transactionId, accountId, amountCents, currency, status = 'posted') => ({
  tenantId: 'tenant-reference-evidence', provider: 'mercury',
  connectionId: 'connection-a', accountId, transactionId,
  amountCents, currency, postedDate: '2026-11-14',
  status, providerReference: 'provider-batch-ref',
});

test('pending reference reuse quarantines posted transfer even with another currency and amount', () => {
  const transactions = [
    row('out', 'checking', -1200, 'USD'),
    row('in', 'savings', 1200, 'USD'),
    row('pending-unrelated', 'foreign', 98765, 'EUR', 'pending'),
  ];
  const before = structuredClone(transactions);
  const result = proposeBankTransferCandidates({
    tenantId: 'tenant-reference-evidence', transactions,
  });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous.map(({ transactionId }) => transactionId), ['out', 'in']);
  assert.ok(result.ambiguous.every(({ candidateCount }) => candidateCount === 1));
  assert.deepEqual(transactions, before);
});

test('inactive cross-currency reference reuse does not quarantine the valid posted pair', () => {
  const transactions = [
    row('out', 'checking', -1200, 'USD'),
    row('in', 'savings', 1200, 'USD'),
    row('removed-unrelated', 'foreign', 98765, 'EUR', 'removed'),
  ];
  const result = proposeBankTransferCandidates({
    tenantId: 'tenant-reference-evidence', transactions,
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});
