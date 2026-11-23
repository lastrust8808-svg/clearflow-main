import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = {
  tenantId: 'tenant-collateral-boundary',
  entityId: 'entity-collateral-boundary',
  trustId: 'trust-collateral-boundary',
  currency: 'USD',
};
const asOfAt = '2026-11-11T00:00:00.000Z';
const collateral = (id, amountMinor) => ({
  ...scope,
  id: 'entry-' + id,
  assetId: 'asset-' + id,
  evidenceRef: 'evidence-' + id,
  observedAt: asOfAt,
  kind: 'noncash_collateral',
  sourceType: 'private_note',
  amountMinor,
});
const classify = entries => calculateReserveCapacity({
  ...scope, asOfAt, maxEvidenceAgeMs: 0, entries,
});

test('noncash collateral aggregate overflow is rejected regardless of entry order', () => {
  const large = collateral('large', Number.MAX_SAFE_INTEGER);
  const small = collateral('small', 1);
  for (const entries of [[large, small], [small, large]]) {
    assert.throws(() => classify(entries), /noncashCollateralMinor exceeds safe integer range/);
  }
});

test('exact noncash collateral safe-integer boundary does not become spendable cash', () => {
  const result = classify([
    collateral('large', Number.MAX_SAFE_INTEGER - 1),
    collateral('small', 1),
  ]);
  assert.equal(result.noncashCollateralMinor, Number.MAX_SAFE_INTEGER);
  assert.equal(result.cashTotalMinor, 0);
  assert.equal(result.unencumberedCashMinor, 0);
});
