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

test('transfer review rejects sparse arrays and array proxies without invoking traps', () => {
  const sparse = Array(2);
  sparse[0] = transaction(0);
  assert.throws(() => review(sparse), /Malformed transfer transaction batch/);

  let trapCalled = false;
  const proxy = new Proxy([transaction(0)], {
    get() { trapCalled = true; throw new Error('proxy trap executed'); },
    ownKeys() { trapCalled = true; throw new Error('proxy trap executed'); },
  });
  assert.throws(() => review(proxy), /Invalid authorized transfer scope or batch/);
  assert.equal(trapCalled, false);
});

test('transfer review rejects accessor length-independent metadata and symbol properties', () => {
  const symbolBatch = [transaction(0)];
  symbolBatch[Symbol('hidden')] = 'untrusted';
  assert.throws(() => review(symbolBatch), /Malformed transfer transaction batch/);

  const accessorBatch = [transaction(0)];
  let called = false;
  Object.defineProperty(accessorBatch, 'metadata', {
    enumerable: true, configurable: true,
    get() { called = true; throw new Error('metadata getter executed'); },
  });
  assert.throws(() => review(accessorBatch), /Malformed transfer transaction batch/);
  assert.equal(called, false);
});


test('transfer review rejects hidden record fields and executable record metadata without evaluating accessors', () => {
  const hidden = transaction(0);
  Object.defineProperty(hidden, 'internalApproval', {
    value: true, enumerable: false, configurable: true,
  });
  assert.throws(() => review([hidden]), /Invalid transfer source record/);

  const symbolRecord = transaction(1);
  symbolRecord[Symbol('approval')] = true;
  assert.throws(() => review([symbolRecord]), /Invalid transfer source record/);

  let getterCalls = 0;
  const accessorRecord = transaction(2);
  Object.defineProperty(accessorRecord, 'providerReference', {
    enumerable: true, configurable: true,
    get() { getterCalls++; throw new Error('untrusted provider getter executed'); },
  });
  assert.throws(() => review([accessorRecord]), /Invalid transfer source record/);
  assert.equal(getterCalls, 0);

  // Untrusted prototype-pollution keys must not be accepted as banking metadata.
  const polluted = transaction(3);
  Object.defineProperty(polluted, '__proto__', {
    value: { approved: true }, enumerable: true, configurable: true,
  });
  assert.throws(() => review([polluted]), /Invalid transfer source record/);
  assert.deepEqual(review([transaction(4)]), { candidates: [], ambiguous: [] });
});
