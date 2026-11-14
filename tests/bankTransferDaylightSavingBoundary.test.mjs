import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

// Posting dates are bank calendar dates, not local timestamps. Day-gap review
// must not depend on the host's daylight-saving-time offset.
const row = (accountId, transactionId, amountCents, postedDate) => ({
  tenantId: 'tenant-dst-boundary',
  provider: 'plaid',
  connectionId: 'connection-dst-boundary',
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate,
  status: 'posted',
  providerReference: 'dst-boundary-transfer',
});
const review = (rows) => proposeBankTransferCandidates({
  tenantId: 'tenant-dst-boundary',
  transactions: rows,
});

for (const [label, first, last] of [
  ['spring forward', '2026-03-07', '2026-03-10'],
  ['fall back', '2026-10-31', '2026-11-03'],
]) {
  test(`${label}: exact three-calendar-day gap is deterministic and review-only`, () => {
    const rows = [
      row('checking', 'debit', -7250, first),
      row('savings', 'credit', 7250, last),
    ];
    const before = structuredClone(rows);
    const result = review(rows);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].dayGap, 3);
    assert.equal(result.candidates[0].status, 'review_required');
    assert.deepEqual(result, review([...rows].reverse()));
    assert.deepEqual(rows, before);
  });
}

test('spring-forward four-calendar-day gap is rejected', () => {
  assert.deepEqual(review([
    row('checking', 'debit', -7250, '2026-03-07'),
    row('savings', 'credit', 7250, '2026-03-11'),
  ]).candidates, []);
});

test('fall-back four-calendar-day gap is rejected', () => {
  assert.deepEqual(review([
    row('checking', 'debit', -7250, '2026-10-31'),
    row('savings', 'credit', 7250, '2026-11-04'),
  ]).candidates, []);
});
