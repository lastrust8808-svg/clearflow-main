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

test('same-account opposite entries cannot be mistaken for an internal transfer', () => {
  const debit = row('checking', 'debit-same-account', -1250);
  const credit = row('checking', 'credit-same-account', 1250);
  const result = review([debit, credit]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous, []);
});

test('two independent providers with matching reference and amounts cannot form a transfer', () => {
  const debit = row('checking', 'plaid-debit', -1250);
  const credit = {
    ...row('savings', 'mercury-credit', 1250),
    provider: 'mercury',
  };
  const result = review([credit, debit]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous, []);
});

test('removed and superseded reference history cannot poison current posted transfer evidence', () => {
  const debit = row('checking', 'current-debit', -1250);
  const credit = row('savings', 'current-credit', 1250);
  const removed = { ...row('old-checking', 'old-removed', -1250), status: 'removed' };
  const superseded = { ...row('old-savings', 'old-superseded', 1250), status: 'superseded' };
  const baseline = review([debit, credit]);
  const result = review([removed, debit, superseded, credit]);
  assert.deepEqual(result, baseline);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'review_required');
  assert.deepEqual(result.ambiguous, []);
});

test('pending evidence sharing a provider reference never creates a candidate on its own', () => {
  const debit = row('checking', 'current-debit', -1250);
  const pendingCredit = { ...row('savings', 'pending-credit', 1250), status: 'pending' };
  const result = review([debit, pendingCredit]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.ambiguous, [{ provider: 'plaid',
    connectionId: 'connection-reference-collision', accountId: 'checking',
    transactionId: 'current-debit', candidateCount: 0 }]);
});

test('pending reference reuse in another connection does not block a posted pair', () => {
  const debit = row('checking', 'posted-debit', -1250);
  const credit = row('savings', 'posted-credit', 1250);
  const pending = {
    ...row('external', 'pending-external', 700),
    connectionId: 'separate-connection',
    status: 'pending',
  };
  const baseline = review([debit, credit]);
  assert.equal(baseline.candidates.length, 1);
  assert.deepEqual(review([pending, debit, credit]), baseline);
});

test('pending reference reuse in another provider does not block a posted pair', () => {
  const debit = row('checking', 'posted-debit', -1250);
  const credit = row('savings', 'posted-credit', 1250);
  const pending = {
    ...row('external', 'pending-mercury', 700),
    provider: 'mercury',
    status: 'pending',
  };
  const baseline = review([debit, credit]);
  assert.equal(baseline.candidates.length, 1);
  assert.deepEqual(review([pending, debit, credit]), baseline);
});

test('provider transaction identity reuse across lifecycle states fails closed', () => {
  const posted = row('checking', 'same-event', -1250);
  const historical = {
    ...row('archived', 'same-event', 1250),
    status: 'removed',
  };
  assert.throws(() => review([posted, historical]), /Duplicate provider transaction identity/);
  assert.throws(() => review([historical, posted]), /Duplicate provider transaction identity/);
});

test('pending and posted copies of one provider event cannot create a transfer candidate', () => {
  const posted = row('checking', 'event-reused', -1250);
  const pending = {
    ...row('savings', 'event-reused', 1250),
    status: 'pending',
  };
  assert.throws(() => review([posted, pending]), /Duplicate provider transaction identity/);
  assert.throws(() => review([pending, posted]), /Duplicate provider transaction identity/);
});


test('a pending collision quarantines only its own reference within the same connection', () => {
  const blockedDebit = row('checking', 'blocked-debit', -1250);
  const blockedCredit = row('savings', 'blocked-credit', 1250);
  const pending = { ...row('pending-account', 'pending-event', 900), status: 'pending' };
  const safeDebit = { ...row('checking', 'safe-debit', -2400), providerReference: 'independent-transfer' };
  const safeCredit = { ...row('savings', 'safe-credit', 2400), providerReference: 'independent-transfer' };
  const first = review([blockedDebit, safeCredit, pending, blockedCredit, safeDebit]);
  const reordered = review([safeDebit, blockedCredit, pending, safeCredit, blockedDebit]);
  assert.deepEqual(first, reordered);
  assert.equal(first.candidates.length, 1);
  assert.equal(first.candidates[0].providerReference, 'independent-transfer');
  assert.equal(first.candidates[0].status, 'review_required');
  assert.deepEqual(first.ambiguous.map((entry) => entry.transactionId),
    ['blocked-debit', 'blocked-credit']);
  assert.deepEqual(first.ambiguous.map((entry) => entry.candidateCount), [1, 1]);
});
