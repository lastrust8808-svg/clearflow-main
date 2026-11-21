import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (transactionId, accountId, amountCents, status = 'posted') => ({
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'connection-a',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-05', status, providerReference: 'reference-1',
});

test('removed and superseded evidence cannot quarantine a valid posted pair', () => {
  const debit = row('debit', 'checking', -1700);
  const credit = row('credit', 'savings', 1700);
  const removed = row('removed', 'reserve', 1700, 'removed');
  const superseded = row('superseded', 'reserve', -1700, 'superseded');
  for (const transactions of [
    [debit, credit, removed, superseded],
    [superseded, removed, credit, debit],
  ]) {
    const original = structuredClone(transactions);
    const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });
    assert.equal(result.candidates.length, 1);
    assert.deepEqual(result.ambiguous, []);
    assert.equal(result.candidates[0].status, 'review_required');
    assert.deepEqual(transactions, original);
  }
});

test('a current pending record with the same reference still quarantines the pair', () => {
  const result = proposeBankTransferCandidates({
    tenantId: 'tenant-a',
    transactions: [
      row('debit', 'checking', -1700),
      row('credit', 'savings', 1700),
      row('removed', 'reserve', 1700, 'removed'),
      row('pending', 'reserve', 1700, 'pending'),
    ],
  });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous.map((entry) => entry.transactionId), ['debit', 'credit']);
});
