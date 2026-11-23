import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const makeRow = (i) => ({
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'connection-a',
  accountId: 'account-a', transactionId: `event-${i}`,
  amountCents: -100, currency: 'USD', postedDate: '2026-11-03',
  status: 'posted', providerReference: `reference-${i}`,
});
const review = (transactions) => proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });

test('transfer review accepts exactly 1000 distinct source events without posting', () => {
  const rows = Array.from({ length: 1000 }, (_, i) => makeRow(i));
  const result = review(rows);
  assert.deepEqual(result, { candidates: [], ambiguous: [] });
  assert.deepEqual(review([...rows].reverse()), result);
});

test('transfer review rejects 1001 source events before reading transaction properties', () => {
  let accessed = 0;
  const rows = Array.from({ length: 1001 }, (_, i) => makeRow(i));
  Object.defineProperty(rows[0], 'amountCents', {
    enumerable: true, get() { accessed++; throw new Error('executed getter'); },
  });
  assert.throws(() => review(rows), /Invalid authorized transfer scope or batch/);
  assert.equal(accessed, 0);
});

test('transfer review rejects a sparse batch even when its declared size is permitted', () => {
  const rows = Array.from({ length: 1000 }, (_, i) => makeRow(i));
  delete rows[999];
  assert.throws(() => review(rows), /Malformed transfer transaction batch/);
});
