import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, overrides = {}) => ({
  tenantId: 'tenant-a', provider: 'plaid', connectionId: 'item-a',
  accountId, transactionId, amountCents,
  currency: 'USD', postedDate: '2026-10-29', status: 'posted',
  providerReference: 'internal-transfer-001', ...overrides,
});
const plan = (transactions, tenantId = 'tenant-a') =>
  proposeBankTransferCandidates({ tenantId, transactions });

test('proposes exactly one review-only, reference-backed opposite-sign transfer', () => {
  const input = [row('checking', 'out', -12500),
    row('savings', 'in', 12500, { postedDate: '2026-10-31' })];
  const before = structuredClone(input);
  const result = plan(input);
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(result.candidates, [{
    provider: 'plaid', connectionId: 'item-a',
    left: { accountId: 'checking', transactionId: 'out' },
    right: { accountId: 'savings', transactionId: 'in' },
    amountCents: 12500, currency: 'USD', providerReference: 'internal-transfer-001',
    dayGap: 2, status: 'review_required',
  }]);
  assert.deepEqual(input, before);
});

test('never guesses a transfer from equal amounts without a shared reference', () => {
  assert.deepEqual(plan([
    row('checking', 'out', -500, { providerReference: undefined }),
    row('savings', 'in', 500, { providerReference: undefined }),
  ]).candidates, []);
  assert.deepEqual(plan([
    row('checking', 'out', -500),
    row('savings', 'in', 500, { providerReference: 'unrelated' }),
  ]).candidates, []);
});

test('excludes pending, removed and superseded transactions', () => {
  for (const status of ['pending', 'removed', 'superseded']) {
    assert.deepEqual(plan([
      row('checking', 'out', -500, { status }),
      row('savings', 'in', 500),
    ]).candidates, []);
  }
});

test('rejects same account, currency mismatch, wrong sign and out-of-window matches', () => {
  const out = row('checking', 'out', -500);
  const variants = [
    row('checking', 'in', 500),
    row('savings', 'in', 500, { currency: 'CAD' }),
    row('savings', 'in', -500),
    row('savings', 'in', 500, { postedDate: '2026-11-03' }),
  ];
  for (const variant of variants) {
    assert.deepEqual(plan([out, variant]).candidates, []);
  }
});

test('ambiguous many-to-one evidence is never proposed as a pair', () => {
  const result = plan([
    row('checking', 'out', -500),
    row('savings', 'in1', 500),
    row('reserve', 'in2', 500),
  ]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous, [
    { provider: 'plaid', connectionId: 'item-a', accountId: 'checking', transactionId: 'out', candidateCount: 2 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'savings', transactionId: 'in1', candidateCount: 1 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'reserve', transactionId: 'in2', candidateCount: 1 },
  ]);
});

test('every source in a many-to-one collision is reported for manual review', () => {
  const result = plan([
    row('checking', 'out1', -700),
    row('reserve', 'out2', -700),
    row('savings', 'in', 700),
  ]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous, [
    { provider: 'plaid', connectionId: 'item-a', accountId: 'checking', transactionId: 'out1', candidateCount: 1 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'reserve', transactionId: 'out2', candidateCount: 1 },
    { provider: 'plaid', connectionId: 'item-a', accountId: 'savings', transactionId: 'in', candidateCount: 2 },
  ]);
});

test('distinct reference-backed transfers do not collapse equal-value payments', () => {
  const result = plan([
    row('checking', 'out1', -500, { providerReference: 'ref1' }),
    row('savings', 'in1', 500, { providerReference: 'ref1' }),
    row('checking', 'out2', -500, { providerReference: 'ref2' }),
    row('savings', 'in2', 500, { providerReference: 'ref2' }),
  ]);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.ambiguous, []);
});

test('cross-tenant, duplicate and malformed source identities fail closed', () => {
  assert.throws(() => plan([row('checking', 'a', -500, { tenantId: 'other' })]), /unauthorized/);
  assert.throws(() => plan([row('checking', 'a', -500), row('checking', 'a', 500)]), /Duplicate/);
  assert.throws(() => plan([row('checking', 'a', 0)]), /unauthorized/);
  assert.throws(() => plan([row('checking', 'a', -500, { currency: 'usd' })]), /unauthorized/);
  assert.throws(() => plan([row('checking', 'a', -500, { postedDate: '2026-02-30' })]), /date/);
  assert.throws(() => plan([row('checking', 'a', -500, { amountCents: 12.5 })]), /unauthorized/);
});

test('accessors, sparse arrays and Proxy evidence cannot enter matching', () => {
  const accessor = row('checking', 'a', -500);
  Object.defineProperty(accessor, 'amountCents', { get() { throw new Error('executed getter'); }, enumerable: true });
  assert.throws(() => plan([accessor]), /Invalid transfer source/);
  assert.throws(() => plan(new Array(1)), /Malformed transfer transaction batch/);
  assert.throws(() => plan([new Proxy(row('checking', 'a', -500), {})]), /Invalid transfer source/);
});

test('identical references cannot match across provider or connection namespaces', () => {
  const debit = row('checking', 'out', -12500);
  for (const incoming of [
    row('savings', 'in', 12500, { provider: 'mercury' }),
    row('savings', 'in', 12500, { connectionId: 'item-b' }),
  ]) {
    assert.deepEqual(plan([debit, incoming]), { candidates: [], ambiguous: [] });
  }
  assert.equal(plan([debit, row('savings', 'in', 12500)]).candidates.length, 1);
});

test('provider and connection are required canonical source identities', () => {
  for (const overrides of [
    { provider: undefined }, { provider: 'other' }, { provider: 'PLAID' },
    { connectionId: undefined }, { connectionId: '' },
    { connectionId: ' item-a' }, { connectionId: 'item-a\n' },
  ]) {
    assert.throws(
      () => plan([row('checking', 'out', -500, overrides)]),
      /Invalid or unauthorized transfer source record/,
    );
  }
  // The same account and transaction ID in a different provider connection
  // is not a duplicate canonical banking transaction and cannot be paired.
  const result = plan([
    row('checking', 'tx-1', -500),
    row('checking', 'tx-1', 500, { connectionId: 'item-b' }),
  ]);
  assert.deepEqual(result, { candidates: [], ambiguous: [] });
});
