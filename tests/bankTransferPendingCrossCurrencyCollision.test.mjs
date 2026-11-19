import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const tenantId = 'tenant-pending-currency-scope';
const row = (accountId, transactionId, amountCents, overrides = {}) => ({
  tenantId, provider: 'mercury', connectionId: 'primary-connection',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-18', status: 'posted',
  providerReference: 'reused-provider-reference', ...overrides,
});
const review = transactions => proposeBankTransferCandidates({ tenantId, transactions });

test('pending evidence in another currency on same connection prevents automatic transfer suggestion', () => {
  const rows = [
    row('checking', 'outgoing', -3200),
    row('savings', 'incoming', 3200),
    row('foreign', 'pending-eur', 3200, { currency: 'EUR', status: 'pending' }),
  ];
  const original = structuredClone(rows);
  const first = review(rows);
  assert.deepEqual(first.candidates, []);
  assert.deepEqual(first.ambiguous.map(x => x.transactionId).sort(), ['incoming', 'outgoing']);
  assert.deepEqual(review([...rows].reverse()), first);
  assert.deepEqual(rows, original);
});

test('pending reference from another connection does not contaminate posted transfer review', () => {
  const rows = [
    row('checking', 'outgoing', -3200),
    row('savings', 'incoming', 3200),
    row('foreign', 'pending-eur', 3200, {
      connectionId: 'other-connection', currency: 'EUR', status: 'pending',
    }),
  ];
  const result = review(rows);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});
