import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

// Boundary amounts must be compared exactly; JavaScript number rounding must
// never create a false internal-transfer match from a malformed bank feed.
const row = (accountId, transactionId, amountCents) => ({
  tenantId: 'tenant-safe-integer-boundary',
  provider: 'mercury',
  connectionId: 'connection-safe-integer-boundary',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-10', status: 'posted',
  providerReference: 'exact-boundary-reference',
});
const review = (transactions) => proposeBankTransferCandidates({
  tenantId: 'tenant-safe-integer-boundary', transactions,
});

test('maximum safe cent amounts may form a review-only candidate without precision loss', () => {
  const debit = row('checking', 'debit', -Number.MAX_SAFE_INTEGER);
  const credit = row('savings', 'credit', Number.MAX_SAFE_INTEGER);
  const input = [debit, credit];
  const before = structuredClone(input);
  const first = review(input);
  assert.deepEqual(first, review([...input].reverse()));
  assert.equal(first.candidates.length, 1);
  assert.equal(first.candidates[0].amountCents, Number.MAX_SAFE_INTEGER);
  assert.equal(first.candidates[0].status, 'review_required');
  assert.deepEqual(first.ambiguous, []);
  assert.deepEqual(input, before);
});

test('unsafe and fractional cent amounts fail closed before matching', () => {
  const debit = row('checking', 'debit', -1250);
  for (const invalid of [Number.MAX_SAFE_INTEGER + 1, -(Number.MAX_SAFE_INTEGER + 1), 1250.5, Infinity, NaN, -0]) {
    assert.throws(() => review([debit, row('savings', 'credit', invalid)]),
      /Invalid or unauthorized transfer source record/);
  }
});

test('one-cent mismatch at the safe integer boundary cannot produce a transfer', () => {
  const debit = row('checking', 'debit', -Number.MAX_SAFE_INTEGER);
  const credit = row('savings', 'credit', Number.MAX_SAFE_INTEGER - 1);
  const result = review([debit, credit]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous, []);
});
