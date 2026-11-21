import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-fresh-boundary', entityId: 'entity-fresh-boundary', trustId: 'trust-fresh-boundary', currency: 'USD' };
const asOfAt = '2026-11-15T12:00:00.000Z';
function snapshot(observedAt, maxEvidenceAgeMs) {
  return {
    ...scope, asOfAt, maxEvidenceAgeMs,
    entries: [{
      ...scope, id: 'entry-fresh-boundary', assetId: 'asset-fresh-boundary',
      evidenceRef: 'evidence-fresh-boundary', observedAt,
      kind: 'cash', sourceType: 'bank_balance', amountMinor: 150,
      restrictedMinor: 20, pledgedMinor: 30,
    }],
  };
}

test('reserve evidence at the exact permitted freshness boundary remains eligible', () => {
  const result = calculateReserveCapacity(snapshot('2026-11-15T11:59:59.000Z', 1000));
  assert.equal(result.unencumberedCashMinor, 100);
  assert.equal(result.oldestEvidenceAt, '2026-11-15T11:59:59.000Z');
});

test('reserve evidence one millisecond older than the permitted freshness boundary fails closed', () => {
  assert.throws(
    () => calculateReserveCapacity(snapshot('2026-11-15T11:59:58.999Z', 1000)),
    /Reserve evidence exceeds configured maximum age/,
  );
});

test('reserve evidence in the future is rejected even with a large freshness allowance', () => {
  assert.throws(
    () => calculateReserveCapacity(snapshot('2026-11-15T12:00:00.001Z', 86400000)),
    /Reserve evidence observed after snapshot as-of timestamp/,
  );
});
