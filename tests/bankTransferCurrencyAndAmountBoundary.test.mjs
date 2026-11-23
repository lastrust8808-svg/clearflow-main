import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const transaction = (accountId, transactionId, amountCents, currency = 'USD') => ({
  tenantId: 'tenant-currency', provider: 'mercury', connectionId: 'connection-currency',
  accountId, transactionId, amountCents, currency, postedDate: '2026-11-14',
  status: 'posted', providerReference: 'same-provider-reference',
});
const review = (transactions) => proposeBankTransferCandidates({
  tenantId: 'tenant-currency', transactions,
});

test('matching references and equal opposite amounts cannot match across currencies', () => {
  const transactions = [
    transaction('checking', 'debit', -2500, 'USD'),
    transaction('savings', 'credit', 2500, 'CAD'),
  ];
  const before = structuredClone(transactions);
  assert.deepEqual(review(transactions), { candidates: [], ambiguous: [] });
  assert.deepEqual(transactions, before);
});

test('same-currency matching remains review-only at the maximum safe integer amount', () => {
  const transactions = [
    transaction('checking', 'debit', -Number.MAX_SAFE_INTEGER),
    transaction('savings', 'credit', Number.MAX_SAFE_INTEGER),
  ];
  const result = review(transactions);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].amountCents, Number.MAX_SAFE_INTEGER);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});

test('unsafe integer transfer amounts fail closed without coercion', () => {
  const transactions = [
    transaction('checking', 'debit', -(Number.MAX_SAFE_INTEGER + 1)),
    transaction('savings', 'credit', Number.MAX_SAFE_INTEGER + 1),
  ];
  assert.throws(() => review(transactions), /Invalid or unauthorized transfer source record/);
});
