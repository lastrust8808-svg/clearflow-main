import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const tenantId = 'tenant-reference-lifecycle';
const row = (transactionId, accountId, amountCents, status, providerReference) => ({
  tenantId, provider: 'mercury', connectionId: 'connection-lifecycle',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-16', status, providerReference,
});

test('pending reference reuse blocks a posted pair regardless of feed arrival order', () => {
  const transactions = [
    row('posted-out', 'checking', -4200, 'posted', 'shared-provider-ref'),
    row('posted-in', 'savings', 4200, 'posted', 'shared-provider-ref'),
    row('pending-third', 'reserve', 4200, 'pending', 'shared-provider-ref'),
  ];
  for (const batch of [transactions, [...transactions].reverse()]) {
    const result = proposeBankTransferCandidates({ tenantId, transactions: batch });
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.ambiguous.map((item) => item.transactionId).sort(),
      ['posted-in', 'posted-out']);
  }
});

test('removed and superseded reference reuse cannot veto a valid current posted pair', () => {
  const transactions = [
    row('posted-out', 'checking', -4200, 'posted', 'shared-provider-ref'),
    row('posted-in', 'savings', 4200, 'posted', 'shared-provider-ref'),
    row('removed-old', 'reserve', 4200, 'removed', 'shared-provider-ref'),
    row('superseded-old', 'reserve', -4200, 'superseded', 'shared-provider-ref'),
  ];
  const result = proposeBankTransferCandidates({ tenantId, transactions });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});
