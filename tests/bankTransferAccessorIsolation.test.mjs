import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents) => ({
  tenantId: 'tenant-accessor-guard',
  provider: 'mercury',
  connectionId: 'connection-a',
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-14',
  status: 'posted',
  providerReference: 'transfer-ref',
});

test('rejects accessor-bearing authorized scope without executing the getter', () => {
  let invoked = 0;
  const scope = { tenantId: 'tenant-accessor-guard' };
  Object.defineProperty(scope, 'transactions', {
    enumerable: true,
    get() { invoked++; throw new Error('getter executed'); },
  });
  assert.throws(() => proposeBankTransferCandidates(scope), /Invalid authorized transfer scope or batch/);
  assert.equal(invoked, 0);
});

test('rejects accessor-bearing source record without executing the getter or mutating other records', () => {
  let invoked = 0;
  const first = row('checking', 'out', -1234);
  const second = row('savings', 'in', 1234);
  Object.defineProperty(second, 'providerReference', {
    enumerable: true,
    get() { invoked++; throw new Error('getter executed'); },
  });
  const before = structuredClone(first);
  assert.throws(() => proposeBankTransferCandidates({
    tenantId: 'tenant-accessor-guard', transactions: [first, second],
  }), /Invalid transfer source record/);
  assert.equal(invoked, 0);
  assert.deepEqual(first, before);
});

test('rejects accessor-bearing batch index without invoking the getter', () => {
  let invoked = 0;
  const transactions = [row('checking', 'out', -1234), row('savings', 'in', 1234)];
  Object.defineProperty(transactions, '1', {
    enumerable: true,
    get() { invoked++; throw new Error('getter executed'); },
  });
  assert.throws(() => proposeBankTransferCandidates({
    tenantId: 'tenant-accessor-guard', transactions,
  }), /Malformed transfer transaction batch/);
  assert.equal(invoked, 0);
});
