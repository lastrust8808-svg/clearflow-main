import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const record = (connectionId, accountId, transactionId, amountCents) => ({
  tenantId: 'tenant-connection-reuse',
  provider: 'mercury',
  connectionId,
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-15',
  status: 'posted',
  providerReference: 'same-bank-reference',
});

test('provider transaction IDs reused in distinct connections remain isolated', () => {
  const rows = [
    record('connection-A', 'checking', 'debit-1', -1500),
    record('connection-A', 'savings', 'credit-1', 1500),
    record('connection-B', 'checking', 'debit-1', -1500),
    record('connection-B', 'savings', 'credit-1', 1500),
  ];
  const before = structuredClone(rows);
  const evaluate = transactions => proposeBankTransferCandidates({
    tenantId: 'tenant-connection-reuse', transactions,
  });
  const result = evaluate(rows);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map(x => x.connectionId).sort(), ['connection-A', 'connection-B']);
  assert.ok(result.candidates.every(x => x.status === 'review_required'));
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(evaluate([...rows].reverse()), result);
  assert.deepEqual(rows, before);
});
