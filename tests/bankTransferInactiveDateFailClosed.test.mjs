import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (transactionId, accountId, amountCents, status = 'posted', postedDate = '2026-11-19') => ({
  tenantId: 'tenant-a', provider: 'mercury', connectionId: 'connection-a',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate, status, providerReference: 'shared-reference',
});

test('invalid pending posting date fails the entire review closed, then clean replay succeeds', () => {
  const valid = [row('debit', 'checking', -2500), row('credit', 'savings', 2500)];
  const invalid = [...valid, row('pending', 'third', 2500, 'pending', '2026-02-29')];
  const original = structuredClone(invalid);
  assert.throws(
    () => proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions: invalid }),
    /Invalid transfer posting date/,
  );
  assert.deepEqual(invalid, original);
  const result = proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions: valid });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});

test('invalid removed posting date cannot bypass source validation', () => {
  const transactions = [
    row('debit', 'checking', -2500),
    row('credit', 'savings', 2500),
    row('removed', 'old', 2500, 'removed', '2026-13-01'),
  ];
  assert.throws(
    () => proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions }),
    /Invalid transfer posting date/,
  );
});
