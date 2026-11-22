import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const base = {
  tenantId: 'tenant-unicode', provider: 'plaid', connectionId: 'connection-unicode',
  accountId: 'checking', transactionId: 'debit', amountCents: -2500,
  currency: 'USD', postedDate: '2026-11-05', status: 'posted',
  providerReference: 'transfer-ref',
};
const review = (record) => proposeBankTransferCandidates({
  tenantId: 'tenant-unicode', transactions: [record],
});

test('noncanonical Unicode provider identities fail closed', () => {
  for (const field of ['connectionId', 'accountId', 'transactionId', 'providerReference']) {
    assert.throws(() => review({ ...base, [field]: 'Cafe\u0301' }),
      /Invalid or unauthorized transfer source record/, field);
  }
});

test('invisible and noncharacter provider identities fail closed', () => {
  for (const value of ['a\u200bb', 'a\u00a0b', 'a\ufdd0b', 'a\u{10ffff}b']) {
    assert.throws(() => review({ ...base, providerReference: value }),
      /Invalid or unauthorized transfer source record/);
  }
});

test('canonical Unicode and ordinary internal ASCII spaces remain valid', () => {
  const record = { ...base, providerReference: 'Café transfer 42' };
  assert.deepEqual(review(record), { candidates: [], ambiguous: [] });
});

test('Unicode separator aliases fail closed across all provider identity fields', () => {
  for (const field of ['connectionId', 'accountId', 'transactionId', 'providerReference']) {
    for (const separator of ['\\u2007', '\\u202f', '\\u3000', '\\u2028', '\\u2060']) {
      const value = 'part' + JSON.parse('"' + separator + '"') + 'two';
      assert.throws(() => review({ ...base, [field]: value }),
        /Invalid or unauthorized transfer source record/, field + ':' + separator);
    }
  }
  for (const separator of ['\\u2007', '\\u202f', '\\u3000', '\\u2028', '\\u2060']) {
    const value = 'tenant' + JSON.parse('"' + separator + '"') + 'unicode';
    assert.throws(() => proposeBankTransferCandidates({ tenantId: value, transactions: [] }),
      /Invalid authorized transfer scope or batch/);
  }
});
