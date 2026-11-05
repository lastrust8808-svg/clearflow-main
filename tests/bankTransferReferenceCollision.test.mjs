import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const row = (accountId, transactionId, amountCents, currency = 'USD', postedDate = '2026-11-01') => ({
  tenantId: 'tenant-reference-collision',
  provider: 'plaid',
  connectionId: 'connection-reference-collision',
  accountId, transactionId, amountCents, currency, postedDate,
  status: 'posted', providerReference: 'shared-statement-reference',
});
const review = (transactions) => proposeBankTransferCandidates({
  tenantId: 'tenant-reference-collision', transactions,
});

test('a third posted record sharing a provider reference prevents a superficially unique pair', () => {
  const debit = row('checking', 'debit', -1250);
  const credit = row('savings', 'credit', 1250);
  // This row cannot match either side by amount, currency, or posting window.
  // Nevertheless the reference is demonstrably not a unique transfer identity.
  const unrelated = row('foreign', 'other', 700, 'EUR', '2026-11-12');
  const baseline = review([debit, credit]);
  assert.equal(baseline.candidates.length, 1);
  assert.equal(baseline.candidates[0].status, 'review_required');

  const first = review([debit, credit, unrelated]);
  const reversed = review([unrelated, credit, debit]);
  assert.deepEqual(first, reversed);
  assert.deepEqual(first.candidates, []);
  assert.deepEqual(first.ambiguous.map((entry) => entry.transactionId),
    ['debit', 'other', 'credit']);
  assert.deepEqual(first.ambiguous.map((entry) => entry.candidateCount),
    [1, 0, 1]);
});

test('reference collisions are scoped to provider connection', () => {
  const debit = row('checking', 'debit', -1250);
  const credit = row('savings', 'credit', 1250);
  const unrelated = { ...row('foreign', 'other', 700), connectionId: 'another-connection' };
  const result = review([debit, credit, unrelated]);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.ambiguous, []);
});

test('identical reference text from a different provider cannot poison a Plaid pair', () => {
  const debit = row('checking', 'debit', -1250);
  const credit = row('savings', 'credit', 1250);
  const mercury = {
    ...row('external', 'mercury-record', 700),
    provider: 'mercury',
  };
  const result = review([mercury, debit, credit]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].provider, 'plaid');
  assert.deepEqual(result.ambiguous, []);
});

test('a pending reference collision blocks review even if it cannot match by amount or date', () => {
  const debit = row('checking', 'debit', -1250);
  const credit = row('savings', 'credit', 1250);
  const pending = {
    ...row('other', 'pending-other', 700, 'EUR', '2026-11-20'),
    status: 'pending',
  };
  const result = review([pending, credit, debit]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous.map((entry) => entry.transactionId), ['debit', 'credit']);
});

test('identical provider transaction IDs on different connections remain isolated', () => {
  const debit = row('checking', 'shared-provider-id', -1250);
  const credit = row('savings', 'credit', 1250);
  const secondConnection = {
    ...row('external', 'shared-provider-id', 900),
    connectionId: 'independent-connection',
  };
  const first = review([debit, credit, secondConnection]);
  const reordered = review([secondConnection, credit, debit]);
  assert.deepEqual(first, reordered);
  assert.equal(first.candidates.length, 1);
  assert.equal(first.candidates[0].status, 'review_required');
  assert.deepEqual(first.ambiguous, []);
});

test('same provider transaction ID reused across accounts within a connection fails closed', () => {
  const debit = row('checking', 'duplicated-provider-id', -1250);
  const credit = row('savings', 'duplicated-provider-id', 1250);
  assert.throws(() => review([debit, credit]), /Duplicate provider transaction identity/);
  assert.throws(() => review([credit, debit]), /Duplicate provider transaction identity/);
});
