import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const tenantId = 'tenant-review-replay';
const transaction = (accountId, transactionId, amountCents) => Object.freeze({
  tenantId, provider: 'plaid', connectionId: 'connection-review-replay',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-18', status: 'posted',
  providerReference: 'reference-review-replay',
});

test('mutating a review result cannot contaminate a subsequent independent review', () => {
  const scope = Object.freeze({
    tenantId,
    transactions: Object.freeze([
      transaction('checking', 'debit', -12345),
      transaction('savings', 'credit', 12345),
    ]),
  });
  const baseline = proposeBankTransferCandidates(scope);
  assert.equal(baseline.candidates.length, 1);
  const expected = structuredClone(baseline);
  baseline.candidates[0].left.accountId = 'tampered';
  baseline.candidates[0].right.transactionId = 'tampered';
  baseline.candidates[0].status = 'approved';
  baseline.candidates.push({ status: 'approved' });
  baseline.ambiguous.push({ transactionId: 'injected' });
  assert.deepEqual(proposeBankTransferCandidates(scope), expected);
  assert.equal(scope.transactions[0].accountId, 'checking');
  assert.equal(scope.transactions[1].transactionId, 'credit');
});

test('a failed review on malformed input does not poison the next valid review', () => {
  const valid = [
    transaction('checking', 'debit', -12345),
    transaction('savings', 'credit', 12345),
  ];
  const bad = { ...valid[1], transactionId: 'debit', accountId: 'checking' };
  assert.throws(
    () => proposeBankTransferCandidates({ tenantId, transactions: [valid[0], bad] }),
    /Duplicate transfer source identity/,
  );
  const clean = proposeBankTransferCandidates({ tenantId, transactions: valid });
  assert.equal(clean.candidates.length, 1);
  assert.equal(clean.candidates[0].status, 'review_required');
});
