import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (transactionId, accountId, amountCents, postedDate, status = 'posted', connectionId = 'connection-a') => ({
  tenantId: 'tenant-a', provider: 'mercury', connectionId,
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate, status, providerReference: 'shared-reference',
});

test('distant pending reuse of a provider reference blocks an otherwise matching transfer', () => {
  const posted = [
    row('debit', 'checking', -4200, '2026-11-19'),
    row('credit', 'savings', 4200, '2026-11-20'),
  ];
  const pending = row('pending-old', 'other', 4200, '2026-01-01', 'pending');
  const batch = [...posted, pending];
  const original = structuredClone(batch);
  const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions: batch });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous.map(({ transactionId }) => transactionId).sort(), ['credit', 'debit']);
  assert.deepEqual(batch, original);
  assert.equal(proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions: posted }).candidates.length, 1);
});

test('distant pending reference in another connection cannot contaminate a valid pair', () => {
  const batch = [
    row('debit', 'checking', -4200, '2026-11-19'),
    row('credit', 'savings', 4200, '2026-11-20'),
    row('pending-old', 'other', 4200, '2026-01-01', 'pending', 'connection-b'),
  ];
  const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions: batch });
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.ambiguous, []);
});
