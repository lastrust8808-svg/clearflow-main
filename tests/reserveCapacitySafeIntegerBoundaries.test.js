import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-overflow', entityId: 'entity-overflow', trustId: 'trust-overflow', currency: 'USD' };
const asOfAt = '2026-11-15T12:00:00.000Z';
const cash = (id, amountMinor, restrictedMinor = 0, pledgedMinor = 0) => ({
  ...scope, id, assetId: 'asset-' + id, evidenceRef: 'evidence-' + id,
  observedAt: asOfAt, kind: 'cash', sourceType: 'bank_balance',
  amountMinor, restrictedMinor, pledgedMinor,
});
const project = entries => calculateReserveCapacity({
  ...scope, asOfAt, maxEvidenceAgeMs: 0, entries,
});

test('aggregate cash amount overflow fails closed rather than rounding available reserves', () => {
  assert.throws(
    () => project([cash('a', Number.MAX_SAFE_INTEGER), cash('b', 1)]),
    /cashTotalMinor exceeds safe integer range/,
  );
});

test('cumulative restricted and pledged totals cannot exceed exact integer range', () => {
  assert.throws(
    () => project([
      cash('a', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      cash('b', 1, 1),
    ]),
    /safe integer range/,
  );
  // Per-entry encumbrance addition must also reject overflow, even if
  // individual amounts are representable.
  assert.throws(
    () => project([cash('a', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1)]),
    /encumberedMinor exceeds safe integer range/,
  );
});

test('maximum exact cash boundary remains valid without rounding', () => {
  const result = project([
    cash('a', Number.MAX_SAFE_INTEGER - 1, 3, 2),
    cash('b', 1, 0, 1),
  ]);
  assert.equal(result.cashTotalMinor, Number.MAX_SAFE_INTEGER);
  assert.equal(result.cashRestrictedMinor, 3);
  assert.equal(result.cashPledgedMinor, 3);
  assert.equal(result.unencumberedCashMinor, Number.MAX_SAFE_INTEGER - 6);
  assert.equal(Object.isFrozen(result), true);
});
