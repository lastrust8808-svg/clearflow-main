import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const transaction = (index) => ({
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
  accountId: 'checking', transactionId: `tx-${index}`,
  amountCents: -100, currency: 'USD', postedDate: '2026-10-29',
  status: 'posted', providerReference: `ref-${index}`,
});
const review = (transactions) => proposeBankTransferCandidates({ tenantId: 'tenant-a', transactions });

test('read-only transfer review accepts the exact bounded 1000-row batch', () => {
  const transactions = Array.from({ length: 1000 }, (_, i) => transaction(i));
  const result = review(transactions);
  assert.deepEqual(result, { candidates: [], ambiguous: [] });
  assert.equal(transactions.length, 1000);
});

test('transfer review rejects 1001 records before processing evidence', () => {
  const transactions = Array.from({ length: 1001 }, (_, i) => transaction(i));
  assert.throws(() => review(transactions), /Invalid authorized transfer scope or batch/);
});

test('transfer review rejects extra array properties and noncanonical array indexes', () => {
  const extra = [transaction(0)];
  extra.metadata = 'untrusted';
  assert.throws(() => review(extra), /Malformed transfer transaction batch/);
  const noncanonical = [transaction(0)];
  noncanonical['01'] = transaction(1);
  assert.throws(() => review(noncanonical), /Malformed transfer transaction batch/);
});

test('transfer review rejects accessor array elements without invoking getter', () => {
  const transactions = [transaction(0)];
  let called = false;
  Object.defineProperty(transactions, '0', {
    enumerable: true, configurable: true,
    get() { called = true; throw new Error('getter executed'); },
  });
  assert.throws(() => review(transactions), /Malformed transfer transaction batch/);
  assert.equal(called, false);
});
