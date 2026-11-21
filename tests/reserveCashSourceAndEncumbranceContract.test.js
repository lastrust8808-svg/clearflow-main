import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = {
  tenantId: 'tenant-1', entityId: 'entity-1', trustId: 'trust-1',
  currency: 'USD', asOfAt: '2026-11-15T12:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000,
};
const entry = {
  id: 'entry-1', assetId: 'asset-1', evidenceRef: 'evidence-1',
  observedAt: '2026-11-15T11:00:00.000Z',
  tenantId: scope.tenantId, entityId: scope.entityId, trustId: scope.trustId,
  currency: scope.currency, kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 10_000, restrictedMinor: 0, pledgedMinor: 0,
};
const classify = overrides => calculateReserveCapacity({
  ...scope, entries: [{ ...entry, ...overrides }],
});

test('cash-classified evidence cannot be reclassified as noncash collateral', () => {
  assert.throws(
    () => classify({ kind: 'noncash_collateral' }),
    /Noncash collateral requires a noncash source classification/,
  );
});

test('cash evidence must explicitly report both encumbrance amounts', () => {
  for (const omitted of ['restrictedMinor', 'pledgedMinor']) {
    const incomplete = { ...entry };
    delete incomplete[omitted];
    assert.throws(
      () => calculateReserveCapacity({ ...scope, entries: [incomplete] }),
      /Cash reserve entries require explicit restrictedMinor and pledgedMinor/,
    );
  }
});

test('valid explicitly encumbered cash is not counted as fully unencumbered', () => {
  const result = classify({ restrictedMinor: 2_000, pledgedMinor: 3_000 });
  assert.equal(result.cashTotalMinor, 10_000);
  assert.equal(result.cashRestrictedMinor, 2_000);
  assert.equal(result.cashPledgedMinor, 3_000);
  assert.equal(result.unencumberedCashMinor, 5_000);
  assert.equal(result.noncashCollateralMinor, 0);
});
