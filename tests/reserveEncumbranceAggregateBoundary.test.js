import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = {
  tenantId: 'tenant-boundary',
  entityId: 'entity-boundary',
  trustId: 'trust-boundary',
  currency: 'USD',
};
const cash = (id, amountMinor, restrictedMinor, pledgedMinor) => ({
  ...scope, id, assetId: `asset-${id}`, evidenceRef: `evidence-${id}`,
  observedAt: '2026-11-11T00:00:00.000Z',
  kind: 'cash', sourceType: 'bank_balance',
  amountMinor, restrictedMinor, pledgedMinor,
});
const project = entries => calculateReserveCapacity({
  ...scope, asOfAt: '2026-11-11T00:00:00.000Z',
  maxEvidenceAgeMs: 0, entries,
});

test('a single cash entry cannot overflow when restricted and pledged amounts are added', () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  assert.throws(
    () => project([cash('one', maximum, maximum, 1)]),
    /encumberedMinor exceeds safe integer range/,
  );
});

test('aggregate pledged cash cannot overflow even when individual encumbrances are valid', () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  for (const entries of [
    [cash('one', maximum, 0, maximum), cash('two', 1, 0, 1)],
    [cash('two', 1, 0, 1), cash('one', maximum, 0, maximum)],
  ]) {
    assert.throws(() => project(entries), /cashTotalMinor exceeds safe integer range|cashPledgedMinor exceeds safe integer range/);
  }
});

test('exact safe-integer boundary with a mixed encumbrance remains nonspendable', () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const result = project([cash('one', maximum, maximum - 1, 1)]);
  assert.equal(result.cashTotalMinor, maximum);
  assert.equal(result.cashRestrictedMinor, maximum - 1);
  assert.equal(result.cashPledgedMinor, 1);
  assert.equal(result.unencumberedCashMinor, 0);
});
