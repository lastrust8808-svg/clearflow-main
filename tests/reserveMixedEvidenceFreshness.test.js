import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

// A valid bank observation cannot launder stale private-note collateral into
// a current trust reserve snapshot. These tests use fabricated local records;
// they do not verify custody, signing authority, or live bank balances.
const scope = { tenantId: 'tenant-evidence', entityId: 'entity-evidence', trustId: 'trust-evidence', currency: 'USD' };
const asOfAt = '2026-11-10T16:00:00.000Z';
function row(id, observedAt, kind = 'cash') {
  return {
    ...scope, id, assetId: 'asset-' + id, evidenceRef: 'evidence-' + id,
    observedAt, kind, sourceType: kind === 'cash' ? 'bank_balance' : 'private_note',
    amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0,
  };
}
function classify(entries, maxEvidenceAgeMs = 1000) {
  return calculateReserveCapacity({ ...scope, asOfAt, maxEvidenceAgeMs, entries });
}

test('stale private-note evidence invalidates the entire mixed reserve snapshot', () => {
  const freshCash = row('bank', asOfAt);
  const staleNote = row('note', '2026-11-10T15:59:58.999Z', 'noncash_collateral');
  for (const entries of [[freshCash, staleNote], [staleNote, freshCash]]) {
    assert.throws(() => classify(entries), /Reserve evidence exceeds configured maximum age/);
  }
});

test('mixed evidence at exact freshness boundary is admitted without promoting notes to cash', () => {
  const result = classify([
    row('bank', asOfAt),
    row('note', '2026-11-10T15:59:59.000Z', 'noncash_collateral'),
  ]);
  assert.equal(result.unencumberedCashMinor, 100);
  assert.equal(result.noncashCollateralMinor, 100);
  assert.equal(result.oldestEvidenceAt, '2026-11-10T15:59:59.000Z');
});

test('future-dated noncash evidence invalidates a snapshot even with fresh cash', () => {
  assert.throws(() => classify([
    row('bank', asOfAt),
    row('note', '2026-11-10T16:00:00.001Z', 'noncash_collateral'),
  ]), /Reserve evidence observed after snapshot as-of timestamp/);
});
