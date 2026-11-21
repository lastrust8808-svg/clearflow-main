import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, overrides = {}) => ({
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'connection-a',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-05', status: 'posted',
  providerReference: 'shared-reference', ...overrides,
});

test('pending reference evidence quarantines only its own provider connection', () => {
  const debit = row('checking', 'debit', -1200);
  const credit = row('savings', 'credit', 1200);
  const externalPending = row('reserve', 'pending', 1200, {
    connectionId: 'connection-b', status: 'pending',
  });
  const externalProviderPending = row('reserve', 'other-provider-pending', 1200, {
    provider: 'mercury', status: 'pending',
  });
  for (const transactions of [
    [debit, credit, externalPending, externalProviderPending],
    [externalProviderPending, externalPending, credit, debit],
  ]) {
    const before = structuredClone(transactions);
    const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });
    assert.equal(result.candidates.length, 1);
    assert.deepEqual(result.ambiguous, []);
    assert.equal(result.candidates[0].status, 'review_required');
    assert.deepEqual(transactions, before);
  }

  const sameConnectionPending = row('reserve', 'pending-local', 1200, {
    status: 'pending',
  });
  const quarantined = proposeBankTransferCandidates({
    tenantId: 'tenant-a',
    transactions: [debit, credit, externalPending, sameConnectionPending],
  });
  assert.deepEqual(quarantined.candidates, []);
  assert.deepEqual(quarantined.ambiguous.map((entry) => entry.transactionId),
    ['debit', 'credit']);
});
