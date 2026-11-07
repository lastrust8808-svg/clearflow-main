import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (tenantId, accountId, transactionId, amountCents) => ({
  tenantId, provider: 'plaid', connectionId: 'shared-provider-connection',
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-05', status: 'posted',
  providerReference: 'shared-provider-reference',
});

test('mixed-tenant batch fails closed even if an otherwise valid pair precedes foreign evidence', () => {
  const debit = row('tenant-a', 'checking', 'debit', -1200);
  const credit = row('tenant-a', 'savings', 'credit', 1200);
  const foreign = row('tenant-b', 'reserve', 'foreign', 1200);
  const original = structuredClone([debit, credit, foreign]);
  for (const transactions of [
    [debit, credit, foreign],
    [foreign, debit, credit],
    [credit, foreign, debit],
  ]) {
    assert.throws(
      () => proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions }),
      /Invalid or unauthorized transfer source record/,
    );
  }
  assert.deepEqual([debit, credit, foreign], original);
  assert.equal(proposeBankTransferCandidates({
    tenantId: 'tenant-a', transactions: [debit, credit],
  }).candidates.length, 1);
});

test('foreign-tenant evidence cannot be laundered by matching account and transaction IDs', () => {
  const debit = row('tenant-a', 'checking', 'same-id', -100);
  const foreignCredit = row('tenant-b', 'savings', 'same-id', 100);
  assert.throws(
    () => proposeBankTransferCandidates({
      tenantId: 'tenant-a', transactions: [debit, foreignCredit],
    }),
    /Invalid or unauthorized transfer source record/,
  );
});
