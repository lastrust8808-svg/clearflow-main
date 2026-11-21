import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

const make = (provider, connectionId, accountId, transactionId, amountCents) => ({
  tenantId: 'tenant-scope-boundary',
  provider, connectionId, accountId, transactionId, amountCents,
  currency: 'USD', postedDate: '2026-11-14', status: 'posted',
  providerReference: 'shared-reference',
});
const review = transactions => proposeBankTransferCandidates({
  tenantId: 'tenant-scope-boundary', transactions,
});

test('opposite amounts with identical reference cannot pair across Mercury connections', () => {
  const rows = [
    make('mercury', 'connection-one', 'checking', 'out', -12345),
    make('mercury', 'connection-two', 'savings', 'in', 12345),
  ];
  const original = structuredClone(rows);
  assert.deepEqual(review(rows), { candidates: [], ambiguous: [] });
  assert.deepEqual(rows, original);
});

test('opposite amounts with identical reference cannot pair across providers', () => {
  const rows = [
    make('mercury', 'same-connection-label', 'checking', 'out', -12345),
    make('plaid', 'same-connection-label', 'savings', 'in', 12345),
  ];
  assert.deepEqual(review(rows), { candidates: [], ambiguous: [] });
});

test('same reference reused across connections does not suppress valid in-connection pairs', () => {
  const rows = [
    make('mercury', 'connection-one', 'checking', 'out-1', -12345),
    make('mercury', 'connection-two', 'checking', 'out-2', -12345),
    make('mercury', 'connection-one', 'savings', 'in-1', 12345),
    make('mercury', 'connection-two', 'savings', 'in-2', 12345),
  ];
  const result = review(rows);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(result.candidates.map(x => x.connectionId).sort(),
    ['connection-one', 'connection-two']);
  assert.ok(result.candidates.every(x => x.status === 'review_required'));
});
