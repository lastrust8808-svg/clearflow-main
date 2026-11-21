import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const tenantId = 'tenant-temporal-reference';
const row = (transactionId, accountId, amountCents, status, postedDate, providerReference) => ({
  tenantId, provider: 'plaid', connectionId: 'connection-temporal',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate, status, providerReference,
});

test('pending reference reuse outside the candidate date window still vetoes the posted pair', () => {
  const transactions = [
    row('debit', 'checking', -7500, 'posted', '2026-11-15', 'reused-ref'),
    row('credit', 'savings', 7500, 'posted', '2026-11-16', 'reused-ref'),
    row('pending-old', 'reserve', 1, 'pending', '2026-01-01', 'reused-ref'),
  ];
  for (const batch of [transactions, [...transactions].reverse()]) {
    const result = proposeBankTransferCandidates({ tenantId, transactions: batch });
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.ambiguous.map(({ transactionId }) => transactionId).sort(),
      ['credit', 'debit']);
  }
});

test('a pending row on a separate provider connection cannot veto the posted pair', () => {
  const transactions = [
    row('debit', 'checking', -7500, 'posted', '2026-11-15', 'reused-ref'),
    row('credit', 'savings', 7500, 'posted', '2026-11-16', 'reused-ref'),
    { ...row('pending-old', 'reserve', 1, 'pending', '2026-01-01', 'reused-ref'),
      connectionId: 'different-connection' },
  ];
  const result = proposeBankTransferCandidates({ tenantId, transactions });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});
