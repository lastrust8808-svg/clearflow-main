import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const transaction = (accountId, transactionId, amountCents, postedDate) => ({
  tenantId: 'tenant-calendar-boundary',
  provider: 'plaid',
  connectionId: 'connection-calendar-boundary',
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate,
  status: 'posted',
  providerReference: 'calendar-boundary-transfer',
});
const review = (transactions) => proposeBankTransferCandidates({
  tenantId: 'tenant-calendar-boundary',
  transactions,
});

test('exact three-day posting gap across leap day remains review-only and deterministic', () => {
  const rows = [
    transaction('checking', 'debit', -4300, '2024-02-28'),
    transaction('savings', 'credit', 4300, '2024-03-02'),
  ];
  const original = structuredClone(rows);
  const result = review(rows);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].dayGap, 3);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result, review([...rows].reverse()));
  assert.deepEqual(rows, original);
});

test('four-day gap across leap day cannot form an internal-transfer candidate', () => {
  const result = review([
    transaction('checking', 'debit', -4300, '2024-02-28'),
    transaction('savings', 'credit', 4300, '2024-03-03'),
  ]);
  assert.deepEqual(result.candidates, []);
});

test('nonexistent leap day fails closed instead of normalizing into March', () => {
  assert.throws(() => review([
    transaction('checking', 'debit', -4300, '2025-02-29'),
    transaction('savings', 'credit', 4300, '2025-03-01'),
  ]), /Invalid transfer posting date/);
});
