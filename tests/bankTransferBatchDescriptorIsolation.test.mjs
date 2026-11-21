import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const tenantId = 'tenant-batch-descriptors';
const record = (accountId, transactionId, amountCents) => ({
  tenantId, provider: 'mercury', connectionId: 'connection-batch-descriptors',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-18', status: 'posted', providerReference: 'transfer-batch-descriptors',
});
const rows = () => [record('checking', 'debit', -2500), record('savings', 'credit', 2500)];
const review = (transactions) => proposeBankTransferCandidates({ tenantId, transactions });

test('plain dense batch still produces a review-only candidate', () => {
  const result = review(rows());
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
});

test('rejects an accessor-backed array element without executing its getter', () => {
  const transactions = rows();
  let called = 0;
  Object.defineProperty(transactions, '1', {
    configurable: true, enumerable: true,
    get() { called++; throw new Error('untrusted getter executed'); },
  });
  assert.throws(() => review(transactions), /Malformed transfer transaction batch/);
  assert.equal(called, 0);
});

test('rejects nonenumerable and symbol-keyed batch metadata', () => {
  const hidden = rows();
  Object.defineProperty(hidden, 'approval', { value: 'approved', enumerable: false });
  assert.throws(() => review(hidden), /Malformed transfer transaction batch/);
  const symbolBatch = rows();
  Object.defineProperty(symbolBatch, Symbol('authorization'), { value: 'approved', enumerable: false });
  assert.throws(() => review(symbolBatch), /Malformed transfer transaction batch/);
});

test('rejects sparse batch even when extra metadata preserves descriptor count', () => {
  const transactions = rows();
  delete transactions[1];
  Object.defineProperty(transactions, 'approval', { value: 'approved', enumerable: false });
  assert.throws(() => review(transactions), /Malformed transfer transaction batch/);
});

test('malformed late slot fails before inspecting earlier record fields', () => {
  const transactions = rows();
  let inspected = 0;
  Object.defineProperty(transactions[0], 'amountCents', {
    enumerable: true, configurable: true,
    get() { inspected++; throw new Error('record getter executed'); },
  });
  Object.defineProperty(transactions, '1', {
    enumerable: true, configurable: true,
    get() { throw new Error('batch getter executed'); },
  });
  assert.throws(() => review(transactions), /Malformed transfer transaction batch/);
  assert.equal(inspected, 0);
});
