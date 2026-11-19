import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const tenantId = 'tenant-calendar-boundary';
const record = (accountId, transactionId, amountCents, postedDate) => ({
  tenantId, provider: 'mercury', connectionId: 'calendar-connection',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate, status: 'posted', providerReference: 'calendar-reference',
});
const review = (firstDate, secondDate) => proposeBankTransferCandidates({
  tenantId, transactions: [
    record('checking', 'debit', -1000, firstDate),
    record('savings', 'credit', 1000, secondDate),
  ],
});

test('calendar-day matching crosses leap day and year boundary at exactly three days', () => {
  const leap = review('2024-02-28', '2024-03-02');
  assert.equal(leap.candidates.length, 1);
  assert.equal(leap.candidates[0].dayGap, 3);
  const year = review('2025-12-30', '2026-01-02');
  assert.equal(year.candidates.length, 1);
  assert.equal(year.candidates[0].dayGap, 3);
});

test('four-day boundary never proposes a transfer even with a shared reference', () => {
  const result = review('2024-02-28', '2024-03-03');
  assert.deepEqual(result.candidates, []);
});

test('invalid leap dates fail closed instead of normalizing into another day', () => {
  assert.throws(() => review('2025-02-29', '2025-03-01'), /Invalid transfer posting date/);
  assert.throws(() => review('2024-02-30', '2024-03-01'), /Invalid transfer posting date/);
});
