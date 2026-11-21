import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, status = 'posted') => ({
  tenantId: 'tenant-lifecycle',
  provider: 'plaid',
  connectionId: 'connection-1',
  accountId,
  transactionId,
  amountCents,
  currency: 'USD',
  postedDate: '2026-11-15',
  status,
  providerReference: 'shared-reference',
});

test('duplicate provider event across lifecycle states cannot create a transfer candidate', () => {
  const debit = row('checking', 'event-1', -2500);
  const credit = row('savings', 'event-2', 2500);
  for (const status of ['pending', 'removed', 'superseded', 'posted']) {
    const duplicate = row('other-account', 'event-1', -2500, status);
    for (const transactions of [[debit, credit, duplicate], [duplicate, credit, debit]]) {
      assert.throws(
        () => proposeBankTransferCandidates({ tenantId: 'tenant-lifecycle', transactions }),
        /Duplicate provider transaction identity across accounts/,
        'same provider event must not be interpreted as a second account transaction',
      );
    }
  }
});
