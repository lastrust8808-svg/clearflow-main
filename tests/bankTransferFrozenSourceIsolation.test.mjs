import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const tenantId = 'tenant-frozen-source';
const row = (accountId, transactionId, amountCents) => Object.freeze({
  tenantId, provider: 'mercury', connectionId: 'connection-frozen-source',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-18', status: 'posted',
  providerReference: 'reference-frozen-source',
});

test('read-only matching accepts frozen bank source records and a frozen batch', () => {
  const transactions = Object.freeze([
    row('checking', 'debit', -4200),
    row('savings', 'credit', 4200),
  ]);
  const scope = Object.freeze({ tenantId, transactions });
  const before = JSON.stringify(scope);
  const result = proposeBankTransferCandidates(scope);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
  assert.equal(JSON.stringify(scope), before);
});

test('returned review candidates do not expose or mutate frozen source objects', () => {
  const debit = row('checking', 'debit', -4200);
  const credit = row('savings', 'credit', 4200);
  const result = proposeBankTransferCandidates(Object.freeze({
    tenantId, transactions: Object.freeze([debit, credit]),
  }));
  const candidate = result.candidates[0];
  assert.notStrictEqual(candidate.left, debit);
  assert.notStrictEqual(candidate.right, credit);
  candidate.left.accountId = 'review-only-change';
  assert.equal(debit.accountId, 'checking');
  assert.equal(credit.accountId, 'savings');
});
