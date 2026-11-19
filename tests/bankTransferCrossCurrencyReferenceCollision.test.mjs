import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, currency = 'USD') => ({
  tenantId: 'tenant-cross-currency-collision',
  provider: 'mercury',
  connectionId: 'connection-cross-currency-collision',
  accountId, transactionId, amountCents, currency,
  postedDate: '2026-11-18', status: 'posted',
  providerReference: 'provider-reference-reused',
});

test('a third posted transaction sharing a reference invalidates an otherwise exact pair even across currencies', () => {
  const input = [
    row('checking', 'debit', -4200),
    row('savings', 'credit', 4200),
    row('foreign', 'eur-entry', 4200, 'EUR'),
  ];
  const first = proposeBankTransferCandidates({ tenantId: 'tenant-cross-currency-collision', transactions: input });
  const reversed = proposeBankTransferCandidates({ tenantId: 'tenant-cross-currency-collision', transactions: [...input].reverse() });
  assert.deepEqual(first, reversed);
  assert.deepEqual(first.candidates, []);
  assert.deepEqual(first.ambiguous.map(({ transactionId }) => transactionId).sort(), ['credit', 'debit', 'eur-entry']);
  assert.ok(first.ambiguous.every(({ candidateCount }) => candidateCount === 0 || candidateCount === 1));
});

test('reference collisions on a separate provider connection cannot invalidate an exact pair', () => {
  const debit = row('checking', 'debit', -4200);
  const credit = row('savings', 'credit', 4200);
  const unrelated = { ...row('foreign', 'unrelated', 4200, 'EUR'), connectionId: 'separate-connection' };
  const result = proposeBankTransferCandidates({
    tenantId: 'tenant-cross-currency-collision', transactions: [debit, credit, unrelated],
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});
