import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const makeRow = (accountId, transactionId, amountCents) => ({
  tenantId: 'tenant-own-keys',
  provider: 'mercury',
  connectionId: 'sandbox-connection',
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-17',
  status: 'posted',
  providerReference: 'shared-reference',
});

test('rejects own prototype-pollution key on bank source without changing prototypes', () => {
  const debit = makeRow('checking', 'debit', -2500);
  const credit = makeRow('savings', 'credit', 2500);
  Object.defineProperty(credit, '__proto__', {
    enumerable: true, configurable: true, writable: true,
    value: { authorized: true },
  });
  assert.throws(() => proposeBankTransferCandidates({
    tenantId: 'tenant-own-keys', transactions: [debit, credit],
  }), /Invalid transfer source record/);
  assert.equal(Object.prototype.authorized, undefined);
  assert.equal(Object.getPrototypeOf(credit), Object.prototype);
});

test('rejects symbol metadata on source records rather than silently ignoring it', () => {
  const debit = makeRow('checking', 'debit', -2500);
  const credit = makeRow('savings', 'credit', 2500);
  credit[Symbol('hidden-authorization')] = 'approved';
  assert.throws(() => proposeBankTransferCandidates({
    tenantId: 'tenant-own-keys', transactions: [debit, credit],
  }), /Invalid transfer source record/);
});

test('rejects own symbol metadata on authorized scope', () => {
  const scope = {
    tenantId: 'tenant-own-keys',
    transactions: [makeRow('checking', 'debit', -2500), makeRow('savings', 'credit', 2500)],
  };
  scope[Symbol('tenant-override')] = 'other-tenant';
  assert.throws(() => proposeBankTransferCandidates(scope), /Invalid authorized transfer scope or batch/);
});
