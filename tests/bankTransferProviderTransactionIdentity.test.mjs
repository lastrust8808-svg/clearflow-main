import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const transaction = (provider, accountId, transactionId, amountCents) => ({
  tenantId: 'tenant-identity-boundary',
  provider,
  connectionId: 'shared-connection-label',
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-13',
  status: 'posted',
  providerReference: 'shared-reference',
});

const review = transactions => proposeBankTransferCandidates({
  tenantId: 'tenant-identity-boundary', transactions,
});

test('one provider transaction ID cannot be treated as two sides of a transfer', () => {
  const records = [
    transaction('mercury', 'checking', 'same-event', -2500),
    transaction('mercury', 'savings', 'same-event', 2500),
  ];
  const before = structuredClone(records);
  assert.throws(() => review(records), /Duplicate provider transaction identity across accounts/);
  assert.throws(() => review([...records].reverse()), /Duplicate provider transaction identity across accounts/);
  assert.deepEqual(records, before);
});

test('identical transaction IDs across distinct providers remain independent', () => {
  const records = [
    transaction('mercury', 'checking', 'shared-out', -2500),
    transaction('mercury', 'savings', 'shared-in', 2500),
    transaction('plaid', 'checking', 'shared-out', -2500),
    transaction('plaid', 'savings', 'shared-in', 2500),
  ];
  const before = structuredClone(records);
  const result = review(records);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map(candidate => candidate.provider).sort(), ['mercury', 'plaid']);
  assert.ok(result.candidates.every(candidate => candidate.status === 'review_required'));
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(result, review([...records].reverse()));
  assert.deepEqual(records, before);
});
