import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, status = 'posted') => ({
  tenantId: 'tenant-a', provider: 'mercury', connectionId: 'connection-a',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-14', status, providerReference: 'batch-ref',
});

test('a third posted transaction sharing a batch reference quarantines an otherwise exact pair', () => {
  const transactions = [
    row('checking', 'debit', -4200),
    row('savings', 'credit', 4200),
    row('fees', 'unrelated-posted', -125),
  ];
  const snapshot = structuredClone(transactions);
  for (const ordered of [transactions, [...transactions].reverse()]) {
    const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions: ordered });
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.ambiguous.map(({ transactionId, candidateCount }) =>
      [transactionId, candidateCount]), [
      ['debit', 1], ['unrelated-posted', 0], ['credit', 1],
    ]);
  }
  assert.deepEqual(transactions, snapshot);
});

test('removed and superseded rows do not create a false current-reference collision', () => {
  for (const inactiveStatus of ['removed', 'superseded']) {
    const transactions = [
      row('checking', 'debit', -4200),
      row('savings', 'credit', 4200),
      row('fees', 'inactive', -125, inactiveStatus),
    ];
    const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].status, 'review_required');
    assert.deepEqual(result.ambiguous, []);
  }
});
