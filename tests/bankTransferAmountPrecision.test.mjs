import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents) => ({
  tenantId: 'tenant-precision', provider: 'mercury', connectionId: 'connection-precision',
  accountId, transactionId, amountCents, currency: 'USD', postedDate: '2026-11-14',
  status: 'posted', providerReference: 'shared-transfer-reference',
});
const review = (transactions) => proposeBankTransferCandidates({
  tenantId: 'tenant-precision', transactions,
});

test('one-cent discrepancy cannot be silently rounded into a transfer candidate', () => {
  const transactions = [row('checking', 'out', -10001), row('savings', 'in', 10000)];
  const before = structuredClone(transactions);
  assert.deepEqual(review(transactions), { candidates: [], ambiguous: [] });
  assert.deepEqual(transactions, before);
});

test('fractional cents fail closed rather than being rounded or coerced', () => {
  for (const amount of [100.5, -100.5, '100', NaN, Infinity, -Infinity]) {
    assert.throws(() => review([row('checking', 'out', -100), row('savings', 'in', amount)]),
      /Invalid or unauthorized transfer source record/);
  }
});

test('zero-value rows cannot generate a transfer candidate', () => {
  for (const amount of [0, -0]) {
    assert.throws(() => review([row('checking', 'out', amount), row('savings', 'in', amount)]),
      /Invalid or unauthorized transfer source record/);
  }
});
