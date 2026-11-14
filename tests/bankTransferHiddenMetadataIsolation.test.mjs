import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const record = (accountId, transactionId, amountCents) => ({
  tenantId: 'tenant-hidden-fields',
  provider: 'mercury',
  connectionId: 'connection-hidden-fields',
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-14',
  status: 'posted',
  providerReference: 'reference-hidden-fields',
});

test('rejects nonenumerable hidden transaction metadata without silently accepting a candidate', () => {
  const first = record('checking', 'debit', -2500);
  const second = record('savings', 'credit', 2500);
  Object.defineProperty(second, 'untrustedAuthorization', {
    value: 'approved', enumerable: false,
  });
  assert.throws(() => proposeBankTransferCandidates({
    tenantId: 'tenant-hidden-fields', transactions: [first, second],
  }), /Invalid transfer source record/);
  assert.equal(second.untrustedAuthorization, 'approved');
});

test('rejects symbol-keyed transaction metadata even when nonenumerable', () => {
  const first = record('checking', 'debit', -2500);
  const second = record('savings', 'credit', 2500);
  const hidden = Symbol('authorization');
  Object.defineProperty(first, hidden, { value: 'approved', enumerable: false });
  assert.throws(() => proposeBankTransferCandidates({
    tenantId: 'tenant-hidden-fields', transactions: [first, second],
  }), /Invalid transfer source record/);
  assert.equal(first[hidden], 'approved');
});

test('rejects nonenumerable scope fields and extra symbol scope fields', () => {
  const transactions = [record('checking', 'debit', -2500), record('savings', 'credit', 2500)];
  const scope = { tenantId: 'tenant-hidden-fields', transactions };
  Object.defineProperty(scope, 'transactions', { value: transactions, enumerable: false });
  assert.throws(() => proposeBankTransferCandidates(scope), /Invalid authorized transfer scope or batch/);
  const other = { tenantId: 'tenant-hidden-fields', transactions };
  Object.defineProperty(other, Symbol('scope'), { value: 'privileged', enumerable: false });
  assert.throws(() => proposeBankTransferCandidates(other), /Invalid authorized transfer scope or batch/);
});
