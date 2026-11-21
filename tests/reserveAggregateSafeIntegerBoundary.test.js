import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-overflow', entityId: 'entity-overflow', trustId: 'trust-overflow', currency: 'USD' };
const asOfAt = '2026-11-11T00:00:00.000Z';
const entry = (suffix, amountMinor, restrictedMinor = 0, pledgedMinor = 0) => ({
  ...scope, id: 'entry-' + suffix, assetId: 'asset-' + suffix,
  evidenceRef: 'evidence-' + suffix, observedAt: asOfAt,
  kind: 'cash', sourceType: 'bank_balance',
  amountMinor, restrictedMinor, pledgedMinor,
});
const classify = entries => calculateReserveCapacity({
  ...scope, asOfAt, maxEvidenceAgeMs: 0, entries,
});

test('individually safe cash amounts cannot overflow aggregate cash total in either order', () => {
  const a = entry('a', Number.MAX_SAFE_INTEGER);
  const b = entry('b', 1);
  for (const entries of [[a, b], [b, a]]) {
    assert.throws(() => classify(entries), /cashTotalMinor exceeds safe integer range/);
  }
});

test('aggregate restricted and pledged amounts cannot overflow even if each entry is valid', () => {
  const restricted = entry('restricted', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const pledged = entry('pledged', 1, 0, 1);
  for (const entries of [[restricted, pledged], [pledged, restricted]]) {
    assert.throws(() => classify(entries), /cashTotalMinor exceeds safe integer range/);
  }
});

test('exact safe-integer boundary remains admissible without rounding', () => {
  const result = classify([entry('a', Number.MAX_SAFE_INTEGER - 1), entry('b', 1)]);
  assert.equal(result.cashTotalMinor, Number.MAX_SAFE_INTEGER);
  assert.equal(result.unencumberedCashMinor, Number.MAX_SAFE_INTEGER);
});
