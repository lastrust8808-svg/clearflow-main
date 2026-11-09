import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

// Boundary acceptance: the maximum permitted batch can contain 500 independent
// review-only transfers. No transfer may be silently omitted at the limit.
const source = (i, side) => ({
  tenantId: 'tenant-load', provider: 'plaid', connectionId: 'item-load',
  accountId: side === 'debit' ? 'checking' : 'savings',
  transactionId: `tx-${i}-${side}`,
  amountCents: side === 'debit' ? -(i + 1) : i + 1,
  currency: 'USD', postedDate: '2026-11-09', status: 'posted',
  providerReference: `transfer-${i}`,
});
const review = (transactions) =>
  proposeBankTransferCandidates({ tenantId: 'tenant-load', transactions });

test('full 1000-row batch yields 500 distinct review-only pairs independent of feed order', () => {
  const rows = Array.from({ length: 500 }, (_, i) => [source(i, 'debit'), source(i, 'credit')]).flat();
  const expected = review(rows);
  assert.equal(expected.candidates.length, 500);
  assert.deepEqual(expected.ambiguous, []);
  assert.equal(new Set(expected.candidates.map((pair) => pair.providerReference)).size, 500);
  assert.ok(expected.candidates.every((pair) => pair.status === 'review_required' && pair.dayGap === 0));
  assert.deepEqual(review([...rows].reverse()), expected);
  assert.deepEqual(review([...rows.slice(500), ...rows.slice(0, 500)]), expected);
  assert.throws(() => review([...rows, source(500, 'debit')]), /Invalid authorized transfer scope or batch/);
});
