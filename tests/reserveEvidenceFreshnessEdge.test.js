import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

// Freshness is evaluated against the authenticated caller's snapshot clock,
// not the order of asset rows or the asset's cash/noncash classification.
const scope = {
  tenantId: 'tenant-freshness-edge',
  entityId: 'entity-freshness-edge',
  trustId: 'trust-freshness-edge',
  currency: 'USD',
};
const asOfAt = '2026-11-11T00:00:00.000Z';
const entry = (id, kind, observedAt) => ({
  ...scope,
  id: 'entry-' + id,
  assetId: 'asset-' + id,
  evidenceRef: 'evidence-' + id,
  observedAt,
  kind,
  sourceType: kind === 'cash' ? 'bank_balance' : 'private_note',
  amountMinor: 100,
  ...(kind === 'cash' ? { restrictedMinor: 0, pledgedMinor: 0 } : {}),
});
const project = entries => calculateReserveCapacity({
  ...scope, asOfAt, maxEvidenceAgeMs: 1000, entries,
});

test('evidence exactly at freshness limit remains eligible in either classification', () => {
  const result = project([
    entry('cash', 'cash', '2026-11-10T23:59:59.000Z'),
    entry('note', 'noncash_collateral', '2026-11-10T23:59:59.000Z'),
  ]);
  assert.equal(result.cashTotalMinor, 100);
  assert.equal(result.noncashCollateralMinor, 100);
  assert.equal(result.oldestEvidenceAt, '2026-11-10T23:59:59.000Z');
});

test('one millisecond beyond freshness limit rejects full snapshot regardless of entry order', () => {
  const fresh = entry('cash', 'cash', asOfAt);
  const stale = entry('note', 'noncash_collateral', '2026-11-10T23:59:58.999Z');
  for (const entries of [[fresh, stale], [stale, fresh]]) {
    assert.throws(() => project(entries), /exceeds configured maximum age/);
  }
});

test('future-dated noncash evidence cannot bypass snapshot as-of cutoff', () => {
  assert.throws(() => project([
    entry('note', 'noncash_collateral', '2026-11-11T00:00:00.001Z'),
  ]), /observed after snapshot as-of timestamp/);
});
