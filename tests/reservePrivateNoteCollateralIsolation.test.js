import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const base = {
  tenantId: 'tenant-1', entityId: 'entity-1', trustId: 'trust-1',
  currency: 'USD', asOfAt: '2026-11-15T12:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000,
};

function collateral(overrides = {}) {
  return {
    id: 'entry-1', assetId: 'asset-1', evidenceRef: 'evidence-1',
    observedAt: '2026-11-15T11:00:00.000Z',
    tenantId: base.tenantId, entityId: base.entityId, trustId: base.trustId,
    currency: base.currency, kind: 'noncash_collateral',
    sourceType: 'private_note', amountMinor: 250_000_00,
    ...overrides,
  };
}

test('private-note collateral never becomes spendable cash', () => {
  const result = calculateReserveCapacity({ ...base, entries: [collateral()] });
  assert.equal(result.noncashCollateralMinor, 250_000_00);
  assert.equal(result.cashTotalMinor, 0);
  assert.equal(result.unencumberedCashMinor, 0);
  assert.equal(result.cashRestrictedMinor, 0);
  assert.equal(result.cashPledgedMinor, 0);
  assert.equal(Object.isFrozen(result), true);
});

test('private-note collateral cannot be relabeled as cash without cash source evidence', () => {
  assert.throws(
    () => calculateReserveCapacity({
      ...base, entries: [collateral({ kind: 'cash', restrictedMinor: 0, pledgedMinor: 0 })],
    }),
    /Cash reserve entry requires a cash source classification/,
  );
});

test('noncash collateral rejects cash encumbrance claims rather than silently subtracting them', () => {
  assert.throws(
    () => calculateReserveCapacity({
      ...base, entries: [collateral({ restrictedMinor: 1, pledgedMinor: 0 })],
    }),
    /Noncash collateral cannot be classified as restricted\/pledged cash/,
  );
});
