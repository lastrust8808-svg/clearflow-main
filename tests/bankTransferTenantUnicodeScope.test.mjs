import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const debit = {
  tenantId: 'tenant-café', provider: 'plaid', connectionId: 'conn-1',
  accountId: 'checking', transactionId: 'debit', amountCents: -1200,
  currency: 'USD', postedDate: '2026-11-12', status: 'posted',
  providerReference: 'transfer-1',
};
const credit = {
  ...debit, accountId: 'savings', transactionId: 'credit', amountCents: 1200,
};

test('noncanonical tenant scope is rejected before transfer review', () => {
  for (const tenantId of ['tenant-cafe\u0301', 'tenant\u200b-id', 'tenant\ufdd0', 'tenant\u{10ffff}']) {
    assert.throws(
      () => proposeBankTransferCandidates({ tenantId, transactions: [debit, credit] }),
      /Invalid authorized transfer scope or batch/,
    );
  }
});

test('noncanonical transaction tenant never aliases an authorized canonical tenant', () => {
  assert.throws(
    () => proposeBankTransferCandidates({
      tenantId: 'tenant-café',
      transactions: [{ ...debit, tenantId: 'tenant-cafe\u0301' }, credit],
    }),
    /Invalid or unauthorized transfer source record/,
  );
});

test('canonical tenant identity permits only review-required candidate', () => {
  const result = proposeBankTransferCandidates({
    tenantId: 'tenant-café', transactions: [debit, credit],
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});
