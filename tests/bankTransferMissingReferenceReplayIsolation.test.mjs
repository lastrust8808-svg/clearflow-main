import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const make = (transactionId, amountCents, extra = {}) => ({
  tenantId: 'tenant-no-reference-replay',
  provider: 'plaid',
  connectionId: 'connection-a',
  accountId: amountCents < 0 ? 'checking' : 'savings',
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-15',
  status: 'posted',
  ...extra,
});

test('unreferenced same-amount feed replays never create transfer candidates', () => {
  const transactions = [
    make('debit-1', -2500),
    make('credit-1', 2500),
    make('debit-2', -2500),
    make('credit-2', 2500),
  ];
  for (const reordered of [transactions, [...transactions].reverse()]) {
    assert.deepEqual(
      proposeBankTransferCandidates({ tenantId: 'tenant-no-reference-replay', transactions: reordered }),
      { candidates: [], ambiguous: [] },
    );
  }
});

test('unreferenced rows cannot borrow a reference from unrelated posted entries', () => {
  const transactions = [
    make('debit-unreferenced', -2500),
    make('credit-unreferenced', 2500),
    make('debit-referenced', -2500, { providerReference: 'reference-2' }),
    make('credit-referenced', 2500, { providerReference: 'reference-2' }),
  ];
  const result = proposeBankTransferCandidates({ tenantId: 'tenant-no-reference-replay', transactions });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].providerReference, 'reference-2');
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(
    [result.candidates[0].left.transactionId, result.candidates[0].right.transactionId].sort(),
    ['credit-referenced', 'debit-referenced'],
  );
});
