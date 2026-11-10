import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBankTransferCandidates } from '../server/services/bankTransferCandidates.js';

// A provider reference is not a unique transfer identifier. At the maximum
// review batch size, three current rows with one reference must not result in
// an arbitrary posted pair, even when the third row is still pending.
const row = (i, status = 'posted') => ({
  tenantId: 'tenant-collision-load',
  provider: 'plaid',
  connectionId: 'connection-collision-load',
  accountId: i % 2 === 0 ? 'checking' : 'savings',
  transactionId: `event-${i}`,
  amountCents: i % 2 === 0 ? -100 : 100,
  currency: 'USD',
  postedDate: '2026-11-09',
  status,
  providerReference: `reference-${Math.floor(i / 2)}`,
});
const review = (transactions) => proposeBankTransferCandidates({
  tenantId: 'tenant-collision-load', transactions,
});

test('a pending third source suppresses only its collided pair at full batch capacity', () => {
  const rows = Array.from({ length: 998 }, (_, i) => row(i));
  const pending = { ...row(998, 'pending'), accountId: 'third-account',
    providerReference: 'reference-0' };
  const extra = { ...row(999), providerReference: 'reference-499' };
  const result = review([...rows, pending, extra]);
  assert.equal(result.candidates.length, 498);
  assert.ok(result.candidates.every((candidate) =>
    candidate.status === 'review_required' &&
    candidate.providerReference !== 'reference-0' &&
    candidate.providerReference !== 'reference-499'));
  assert.deepEqual(result.ambiguous.map((source) => source.transactionId).sort(),
    ['event-0', 'event-1', 'event-998', 'event-999'].filter((id) => id !== 'event-998').sort());
});
