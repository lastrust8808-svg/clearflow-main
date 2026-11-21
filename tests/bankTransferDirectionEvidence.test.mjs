import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, status = 'posted') => ({
  tenantId: 'tenant-direction', provider: 'mercury', connectionId: 'connection-direction',
  accountId, transactionId, amountCents, currency: 'USD', postedDate: '2026-11-14',
  status, providerReference: 'reference-direction',
});
const review = (transactions) => proposeBankTransferCandidates({
  tenantId: 'tenant-direction', transactions,
});

test('same-direction entries sharing a reference cannot be mistaken for an internal transfer', () => {
  for (const amount of [12500, -12500]) {
    const transactions = [row('checking', 'a', amount), row('savings', 'b', amount)];
    const before = structuredClone(transactions);
    assert.deepEqual(review(transactions), { candidates: [], ambiguous: [] });
    assert.deepEqual(transactions, before);
  }
});

test('equal and opposite posted amounts produce review-only evidence, never approval', () => {
  const transactions = [row('checking', 'out', -12500), row('savings', 'in', 12500)];
  const before = structuredClone(transactions);
  const result = review(transactions);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.ambiguous, []);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.equal(result.candidates[0].amountCents, 12500);
  assert.deepEqual(transactions, before);
});
