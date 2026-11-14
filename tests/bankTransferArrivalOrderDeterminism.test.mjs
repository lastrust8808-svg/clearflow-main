import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

// Feed pagination and retry order must not change review outcomes.
const row = (connectionId, accountId, transactionId, amountCents, reference) => ({
  tenantId: 'tenant-order', provider: 'mercury', connectionId,
  accountId, transactionId, amountCents, currency: 'USD',
  postedDate: '2026-11-14', status: 'posted', providerReference: reference,
});
const review = (transactions) => proposeBankTransferCandidates({
  tenantId: 'tenant-order', transactions,
});

test('independent review candidates have stable ordering across reversed bank-feed arrival', () => {
  const rows = [
    row('conn-b', 'savings', 'b-in', 2000, 'ref-b'),
    row('conn-a', 'checking', 'a-out', -1000, 'ref-a'),
    row('conn-b', 'checking', 'b-out', -2000, 'ref-b'),
    row('conn-a', 'savings', 'a-in', 1000, 'ref-a'),
  ];
  const before = structuredClone(rows);
  const first = review(rows);
  assert.equal(first.candidates.length, 2);
  assert.deepEqual(first.ambiguous, []);
  assert.deepEqual(review([...rows].reverse()), first);
  assert.deepEqual([rows[2], rows[0], rows[3], rows[1]].length, 4);
  assert.deepEqual(review([rows[2], rows[0], rows[3], rows[1]]), first);
  assert.ok(first.candidates.every((candidate) => candidate.status === 'review_required'));
  assert.deepEqual(rows, before);
});

test('ambiguous collision evidence stays stable across source ordering', () => {
  const rows = [
    row('conn-a', 'checking', 'out', -2500, 'shared'),
    row('conn-a', 'savings', 'in', 2500, 'shared'),
    row('conn-a', 'reserve', 'extra', 2500, 'shared'),
  ];
  const first = review(rows);
  assert.equal(first.candidates.length, 0);
  assert.equal(first.ambiguous.length, 3);
  assert.deepEqual(review([...rows].reverse()), first);
  assert.deepEqual(review([rows[1], rows[2], rows[0]]), first);
});
