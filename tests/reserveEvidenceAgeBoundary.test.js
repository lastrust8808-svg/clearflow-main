import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-age', entityId: 'entity-age', trustId: 'trust-age', currency: 'USD' };
const asOfAt = '2026-11-10T15:00:00.000Z';
const evidence = (id, observedAt) => ({
  id, assetId: 'asset-' + id, evidenceRef: 'receipt-' + id,
  ...scope, currency: 'USD', observedAt,
  kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0,
});
const snapshot = (entries, maxEvidenceAgeMs = 1000) => ({
  ...scope, asOfAt, maxEvidenceAgeMs, entries,
});

test('reserve evidence age is inclusive at exact millisecond boundary', () => {
  const result = calculateReserveCapacity(snapshot([
    evidence('exact', '2026-11-10T14:59:59.000Z'),
    evidence('recent', '2026-11-10T14:59:59.999Z'),
  ]));
  assert.equal(result.unencumberedCashMinor, 200);
  assert.equal(result.oldestEvidenceAt, '2026-11-10T14:59:59.000Z');
});

test('one millisecond of stale evidence invalidates the entire reserve snapshot', () => {
  assert.throws(() => calculateReserveCapacity(snapshot([
    evidence('fresh', asOfAt),
    evidence('stale', '2026-11-10T14:59:58.999Z'),
  ])), /Reserve evidence exceeds configured maximum age/);
});

test('future-dated evidence is rejected even when maximum age is zero', () => {
  assert.equal(calculateReserveCapacity(snapshot([evidence('exact', asOfAt)], 0)).unencumberedCashMinor, 100);
  assert.throws(() => calculateReserveCapacity(snapshot([
    evidence('future', '2026-11-10T15:00:00.001Z'),
  ], 0)), /Reserve evidence observed after snapshot as-of timestamp/);
});
