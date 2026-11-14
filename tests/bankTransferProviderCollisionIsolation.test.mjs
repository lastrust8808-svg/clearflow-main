import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

// A pending item with the same reference must not contaminate another
// provider's independent connection namespace.
const row = (provider, connectionId, accountId, transactionId, amountCents, status = 'posted') => ({
  tenantId: 'tenant-provider-boundary', provider, connectionId, accountId,
  transactionId, amountCents, currency: 'USD', postedDate: '2026-11-12',
  status, providerReference: 'reused-provider-reference',
});
const review = transactions => proposeBankTransferCandidates({
  tenantId: 'tenant-provider-boundary', transactions,
});

test('pending collision in Plaid does not suppress Mercury review with same connection ID', () => {
  const records = [
    row('plaid', 'same-connection-label', 'plaid-checking', 'p-out', -2000),
    row('plaid', 'same-connection-label', 'plaid-savings', 'p-in', 2000),
    row('plaid', 'same-connection-label', 'plaid-pending', 'p-pending', -2000, 'pending'),
    row('mercury', 'same-connection-label', 'mercury-checking', 'm-out', -2000),
    row('mercury', 'same-connection-label', 'mercury-savings', 'm-in', 2000),
  ];
  const before = structuredClone(records);
  const result = review(records);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].provider, 'mercury');
  assert.equal(result.candidates[0].status, 'review_required');
  assert.equal(result.ambiguous.length, 2);
  assert.ok(result.ambiguous.every(entry => entry.provider === 'plaid'));
  assert.deepEqual(result, review([...records].reverse()));
  assert.deepEqual(records, before);
});
