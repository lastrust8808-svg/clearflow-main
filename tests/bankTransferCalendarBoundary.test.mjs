import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, postedDate) => ({
  tenantId: 'tenant-calendar', provider: 'plaid', connectionId: 'connection-calendar',
  accountId, transactionId, amountCents, currency: 'USD', postedDate,
  status: 'posted', providerReference: 'calendar-transfer',
});
const review = (start, end) => proposeBankTransferCandidates({
  tenantId: 'tenant-calendar',
  transactions: [row('checking', 'debit', -900, start), row('savings', 'credit', 900, end)],
});

test('UTC calendar-day window remains inclusive across leap day and year boundaries', () => {
  for (const [start, end, gap] of [
    ['2028-02-28', '2028-03-02', 3],
    ['2026-12-30', '2027-01-02', 3],
    ['2028-02-29', '2028-03-01', 1],
  ]) {
    const result = review(start, end);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].dayGap, gap);
    assert.equal(result.candidates[0].status, 'review_required');
    assert.deepEqual(result.ambiguous, []);
  }
});

test('four UTC calendar days never qualify even across leap day', () => {
  for (const [start, end] of [
    ['2028-02-28', '2028-03-03'],
    ['2026-12-29', '2027-01-02'],
  ]) {
    assert.deepEqual(review(start, end), { candidates: [], ambiguous: [] });
  }
});

test('invalid leap days and noncanonical dates fail closed', () => {
  for (const invalid of ['2027-02-29', '2028-02-30', '2028-2-29', '2028-02-29T00:00:00Z']) {
    assert.throws(() => review(invalid, '2028-03-01'), /Invalid transfer posting date/);
  }
});
