import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = {
  tenantId: 'tenant-collateral-overflow',
  entityId: 'entity-collateral-overflow',
  trustId: 'trust-collateral-overflow',
  currency: 'USD',
};
const instant = '2026-11-15T12:00:00.000Z';
const collateral = (id, amountMinor) => ({
  ...scope,
  id,
  assetId: 'asset-' + id,
  evidenceRef: 'evidence-' + id,
  observedAt: instant,
  kind: 'noncash_collateral',
  sourceType: 'private_note',
  amountMinor,
});
const snapshot = entries => ({
  ...scope,
  asOfAt: instant,
  maxEvidenceAgeMs: 0,
  entries,
});

test('aggregate noncash collateral cannot overflow safe integer accounting', () => {
  assert.throws(
    () => calculateReserveCapacity(snapshot([
      collateral('first', Number.MAX_SAFE_INTEGER),
      collateral('second', 1),
    ])),
    /noncashCollateralMinor exceeds safe integer range/,
  );
});

test('maximum safe noncash collateral is preserved exactly and never classified as cash', () => {
  const result = calculateReserveCapacity(snapshot([
    collateral('first', Number.MAX_SAFE_INTEGER - 1),
    collateral('second', 1),
  ]));
  assert.equal(result.noncashCollateralMinor, Number.MAX_SAFE_INTEGER);
  assert.equal(result.cashTotalMinor, 0);
  assert.equal(result.unencumberedCashMinor, 0);
  assert.equal(Object.isFrozen(result), true);
});

test('noncash collateral may not assert cash encumbrances to bypass classification', () => {
  assert.throws(
    () => calculateReserveCapacity(snapshot([
      { ...collateral('first', 100), restrictedMinor: 1, pledgedMinor: 0 },
    ])),
    /Noncash collateral cannot be classified as restricted\/pledged cash/,
  );
});
