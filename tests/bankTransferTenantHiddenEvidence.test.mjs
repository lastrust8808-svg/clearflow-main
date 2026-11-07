import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const transaction = (tenantId, accountId, transactionId, amountCents) => ({
  tenantId, provider: 'plaid', connectionId: 'connection-1', accountId,
  transactionId, amountCents, currency: 'USD', postedDate: '2026-11-05',
  status: 'posted', providerReference: 'transfer-1',
});

test('non-enumerable foreign-tenant transaction evidence fails closed before review', () => {
  const debit = transaction('tenant-a', 'checking', 'debit', -500);
  const credit = transaction('tenant-a', 'savings', 'credit', 500);
  const foreign = transaction('tenant-b', 'reserve', 'foreign', 500);
  const batch = [debit, credit];
  Object.defineProperty(batch, '2', { value: foreign, enumerable: false, configurable: true });
  assert.throws(
    () => proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions: batch }),
    /Malformed transfer transaction batch/,
  );
  assert.equal(batch[2], foreign);
  assert.equal(proposeBankTransferCandidates({
    tenantId: 'tenant-a', transactions: [debit, credit],
  }).candidates.length, 1);
});

test('foreign-tenant evidence hidden in a non-enumerable record property is rejected', () => {
  const debit = transaction('tenant-a', 'checking', 'debit', -500);
  const credit = transaction('tenant-a', 'savings', 'credit', 500);
  Object.defineProperty(credit, 'foreignTenantEvidence', {
    value: transaction('tenant-b', 'reserve', 'foreign', 500), enumerable: false,
  });
  assert.throws(
    () => proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions: [debit, credit] }),
    /Invalid transfer source record/,
  );
});
