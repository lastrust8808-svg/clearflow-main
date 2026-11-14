import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, status = 'posted') => ({
  tenantId: 'tenant-a', provider: 'mercury', connectionId: 'connection-a',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-14', status, providerReference: 'shared-ref',
});

test('a pending duplicate on the debit account quarantines both posted sides regardless of feed order', () => {
  const rows = [
    row('checking', 'posted-debit', -7500),
    row('savings', 'posted-credit', 7500),
    row('checking', 'pending-debit', -7500, 'pending'),
  ];
  const original = structuredClone(rows);
  for (const transactions of [rows, [...rows].reverse()]) {
    const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.ambiguous.map(({ transactionId, candidateCount }) =>
      [transactionId, candidateCount]), [
      ['posted-debit', 1], ['posted-credit', 1],
    ]);
  }
  assert.deepEqual(rows, original);
});

test('a superseded duplicate does not quarantine the posted transfer', () => {
  const transactions = [
    row('checking', 'posted-debit', -7500),
    row('savings', 'posted-credit', 7500),
    row('checking', 'superseded-debit', -7500, 'superseded'),
  ];
  const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});
