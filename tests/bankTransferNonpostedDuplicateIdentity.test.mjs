import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, status = 'posted') => ({
  tenantId: 'tenant-pending-identity',
  provider: 'mercury',
  connectionId: 'connection-1',
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-14',
  status,
  providerReference: 'reference-1',
});

test('pending duplicate provider transaction identity across accounts fails closed', () => {
  const records = [
    row('checking', 'out', -4200),
    row('savings', 'in', 4200),
    row('pending-account', 'duplicate', 4200, 'pending'),
    row('other-account', 'duplicate', -4200, 'pending'),
  ];
  const before = structuredClone(records);
  assert.throws(
    () => proposeBankTransferCandidates({ tenantId: 'tenant-pending-identity', transactions: records }),
    /Duplicate provider transaction identity across accounts/,
  );
  assert.deepEqual(records, before);
});

test('inactive duplicate provider transaction identity across accounts also fails closed', () => {
  const records = [
    row('checking', 'out', -4200),
    row('savings', 'in', 4200),
    row('removed-account', 'duplicate', 4200, 'removed'),
    row('superseded-account', 'duplicate', -4200, 'superseded'),
  ];
  const before = structuredClone(records);
  assert.throws(
    () => proposeBankTransferCandidates({ tenantId: 'tenant-pending-identity', transactions: records }),
    /Duplicate provider transaction identity across accounts/,
  );
  assert.deepEqual(records, before);
});
