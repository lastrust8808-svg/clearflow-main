import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const transaction = (connectionId, accountId, transactionId, amountCents) => ({
  tenantId: 'tenant-connection-scope',
  provider: 'mercury',
  connectionId,
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-14',
  status: 'posted',
  providerReference: 'same-provider-reference',
});

const review = transactions => proposeBankTransferCandidates({
  tenantId: 'tenant-connection-scope',
  transactions,
});

test('reused provider transaction IDs on separate connections remain independent', () => {
  const records = [
    transaction('connection-a', 'checking', 'out', -4200),
    transaction('connection-a', 'savings', 'in', 4200),
    transaction('connection-b', 'checking', 'out', -4200),
    transaction('connection-b', 'savings', 'in', 4200),
  ];
  const before = structuredClone(records);
  const result = review(records);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map(candidate => candidate.connectionId).sort(),
    ['connection-a', 'connection-b']);
  assert.deepEqual(result.ambiguous, []);
  assert.ok(result.candidates.every(candidate => candidate.status === 'review_required'));
  assert.deepEqual(result, review([...records].reverse()));
  assert.deepEqual(records, before);
});

test('same provider transaction ID reused across accounts within one connection fails closed', () => {
  const records = [
    transaction('connection-a', 'checking', 'duplicate', -4200),
    transaction('connection-a', 'savings', 'duplicate', 4200),
    transaction('connection-b', 'checking', 'out', -4200),
    transaction('connection-b', 'savings', 'in', 4200),
  ];
  const before = structuredClone(records);
  assert.throws(() => review(records), /Duplicate provider transaction identity across accounts/);
  assert.deepEqual(records, before);
});
