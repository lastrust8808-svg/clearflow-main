import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const tenantId = 'safe-integer-negation';
const makeRow = (accountId, transactionId, amountCents) => ({
  tenantId, provider: 'mercury', connectionId: 'safe-integer-connection',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-18', status: 'posted',
  providerReference: 'safe-integer-reference',
});
const review = (rows) => proposeBankTransferCandidates({ tenantId, transactions: rows });

test('maximum safe cent amount remains exact and review-only in both feed orders', () => {
  const rows = [
    makeRow('checking', 'debit', -Number.MAX_SAFE_INTEGER),
    makeRow('savings', 'credit', Number.MAX_SAFE_INTEGER),
  ];
  const before = structuredClone(rows);
  for (const batch of [rows, [...rows].reverse()]) {
    const result = review(batch);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].amountCents, Number.MAX_SAFE_INTEGER);
    assert.equal(result.candidates[0].status, 'review_required');
    assert.deepEqual(result.ambiguous, []);
  }
  assert.deepEqual(rows, before);
});

test('unsafe cent magnitudes fail closed rather than rounding into a matching pair', () => {
  for (const unsafe of [Number.MAX_SAFE_INTEGER + 1, -(Number.MAX_SAFE_INTEGER + 1), Infinity, NaN]) {
    assert.throws(() => review([
      makeRow('checking', 'debit', unsafe),
      makeRow('savings', 'credit', -unsafe),
    ]), /Invalid or unauthorized transfer source record/);
  }
});
