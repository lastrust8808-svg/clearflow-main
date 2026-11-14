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


test('full batch ignores retired reference evidence but pending evidence blocks pairing', () => {
  const rows = Array.from({ length: 499 }, (_, i) => [source(i, 'debit'), source(i, 'credit')]).flat();
  const retired = { ...source(0, 'debit'), transactionId: 'retired-0', status: 'removed' };
  const superseded = { ...source(1, 'credit'), transactionId: 'superseded-1', status: 'superseded' };
  const retiredBatch = [...rows, retired, superseded];
  const accepted = review(retiredBatch);
  assert.equal(retiredBatch.length, 1000);
  assert.equal(accepted.candidates.length, 499);
  assert.deepEqual(accepted.ambiguous, []);
  assert.deepEqual(review([...retiredBatch].reverse()), accepted);

  const pending = { ...retired, status: 'pending' };
  const pendingBatch = [...rows, pending, superseded];
  const blocked = review(pendingBatch);
  assert.equal(blocked.candidates.length, 498);
  assert.equal(blocked.candidates.some((pair) => pair.providerReference === 'transfer-0'), false);
  assert.deepEqual(blocked.ambiguous.map((row) => row.transactionId).sort(), ['tx-0-credit', 'tx-0-debit']);
  assert.deepEqual(review([...pendingBatch].reverse()), blocked);
});
