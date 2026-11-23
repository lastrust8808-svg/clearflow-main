import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, extra = {}) => ({
  tenantId: 'tenant-missing-reference',
  provider: 'plaid',
  connectionId: 'connection-1',
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-15',
  status: 'posted',
  ...extra,
});

test('equal and opposite posted amounts without provider references never imply a transfer', () => {
  const transactions = [
    row('checking', 'out', -15000),
    row('savings', 'in', 15000),
  ];
  assert.deepEqual(
    proposeBankTransferCandidates({ tenantId: 'tenant-missing-reference', transactions }),
    { candidates: [], ambiguous: [] },
  );
});

test('an unreferenced posted entry cannot pair with a referenced entry', () => {
  const transactions = [
    row('checking', 'out', -15000, { providerReference: 'transfer-1' }),
    row('savings', 'in', 15000),
  ];
  assert.deepEqual(
    proposeBankTransferCandidates({ tenantId: 'tenant-missing-reference', transactions }),
    { candidates: [], ambiguous: [] },
  );
});

test('removed and superseded references cannot supply missing posted transfer evidence', () => {
  const transactions = [
    row('checking', 'out', -15000),
    row('savings', 'in', 15000),
    row('checking', 'removed', -15000, { status: 'removed', providerReference: 'transfer-1' }),
    row('savings', 'superseded', 15000, { status: 'superseded', providerReference: 'transfer-1' }),
  ];
  assert.deepEqual(
    proposeBankTransferCandidates({ tenantId: 'tenant-missing-reference', transactions }),
    { candidates: [], ambiguous: [] },
  );
});
