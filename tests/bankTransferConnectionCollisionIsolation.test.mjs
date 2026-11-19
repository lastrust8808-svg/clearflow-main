import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

// A provider reference is scoped to a provider connection, never globally.
// A collision on one connection must not hide an independent transfer review.
const row = (connectionId, accountId, transactionId, amountCents, providerReference, status = 'posted') => ({
  tenantId: 'tenant-connection-collision',
  provider: 'plaid',
  connectionId,
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-10',
  status,
  providerReference,
});
const review = (transactions) => proposeBankTransferCandidates({
  tenantId: 'tenant-connection-collision',
  transactions,
});

test('pending reference collision blocks only its own connection', () => {
  const transactions = [
    row('connection-a', 'checking-a', 'debit-a', -4500, 'shared-reference'),
    row('connection-a', 'savings-a', 'credit-a', 4500, 'shared-reference'),
    row('connection-a', 'checking-a', 'pending-a', -4500, 'shared-reference', 'pending'),
    row('connection-b', 'checking-b', 'debit-b', -4500, 'shared-reference'),
    row('connection-b', 'savings-b', 'credit-b', 4500, 'shared-reference'),
  ];
  const before = structuredClone(transactions);
  const result = review(transactions);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].connectionId, 'connection-b');
  assert.equal(result.candidates[0].status, 'review_required');
  assert.equal(result.ambiguous.length, 2);
  assert.ok(result.ambiguous.every((entry) => entry.connectionId === 'connection-a'));
  assert.deepEqual(result, review([...transactions].reverse()));
  assert.deepEqual(transactions, before);
});

test('a reference collision in one connection cannot suppress another independent pair', () => {
  const transactions = [
    row('connection-a', 'checking-a', 'debit-a', -4500, 'shared-reference'),
    row('connection-a', 'savings-a', 'credit-a', 4500, 'shared-reference'),
    row('connection-a', 'other-a', 'extra-a', 2000, 'shared-reference'),
    row('connection-b', 'checking-b', 'debit-b', -4500, 'shared-reference'),
    row('connection-b', 'savings-b', 'credit-b', 4500, 'shared-reference'),
  ];
  const result = review(transactions);
  assert.deepEqual(result.candidates.map((candidate) => candidate.connectionId), ['connection-b']);
  assert.equal(result.ambiguous.filter((entry) => entry.connectionId === 'connection-a').length, 3);
  assert.deepEqual(result, review([...transactions].reverse()));
});

test('identical connection and reference strings from different providers stay isolated', () => {
  const transactions = [
    row('shared-connection', 'checking-plaid', 'debit-plaid', -4500, 'same-reference'),
    row('shared-connection', 'savings-plaid', 'credit-plaid', 4500, 'same-reference'),
    { ...row('shared-connection', 'checking-mercury', 'debit-mercury', -4500, 'same-reference'), provider: 'mercury' },
    { ...row('shared-connection', 'savings-mercury', 'credit-mercury', 4500, 'same-reference'), provider: 'mercury' },
  ];
  const before = structuredClone(transactions);
  const result = review(transactions);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map((candidate) => candidate.provider).sort(), ['mercury', 'plaid']);
  assert.ok(result.candidates.every((candidate) => candidate.status === 'review_required'));
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(result, review([...transactions].reverse()));
  assert.deepEqual(transactions, before);
});

test('pending reference reuse at one provider cannot contaminate another provider', () => {
  const transactions = [
    row('shared-connection', 'checking-plaid', 'debit-plaid', -4500, 'same-reference'),
    row('shared-connection', 'savings-plaid', 'credit-plaid', 4500, 'same-reference'),
    row('shared-connection', 'pending-plaid', 'pending-plaid', -4500, 'same-reference', 'pending'),
    { ...row('shared-connection', 'checking-mercury', 'debit-mercury', -4500, 'same-reference'), provider: 'mercury' },
    { ...row('shared-connection', 'savings-mercury', 'credit-mercury', 4500, 'same-reference'), provider: 'mercury' },
  ];
  const result = review(transactions);
  assert.deepEqual(result.candidates.map((candidate) => candidate.provider), ['mercury']);
  assert.equal(result.ambiguous.length, 2);
  assert.ok(result.ambiguous.every((entry) => entry.provider === 'plaid'));
  assert.deepEqual(result, review([...transactions].reverse()));
});
