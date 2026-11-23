import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-clock', entityId: 'entity-clock', trustId: 'trust-clock', currency: 'USD' };
const asOfAt = '2026-11-10T20:00:00.000Z';
const cash = { ...scope, id: 'cash-clock', assetId: 'asset-clock', evidenceRef: 'receipt-clock', observedAt: asOfAt, kind: 'cash', sourceType: 'bank_balance', amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0 };
const classify = (observedAt, asOf = asOfAt) => calculateReserveCapacity({ ...scope, asOfAt: asOf, maxEvidenceAgeMs: 0, entries: [{ ...cash, observedAt }] });

test('reserve evidence timestamps reject impossible calendar dates instead of Date.parse normalization', () => {
  for (const observedAt of ['2026-02-29T20:00:00.000Z', '2026-04-31T20:00:00.000Z', '2026-11-10T24:00:00.000Z', '2026-11-10T20:00:60.000Z']) {
    assert.throws(() => classify(observedAt), /canonical UTC ISO timestamp/);
  }
});

test('reserve snapshot as-of timestamps reject impossible calendar dates', () => {
  for (const asOf of ['2026-02-29T20:00:00.000Z', '2026-04-31T20:00:00.000Z']) {
    assert.throws(() => classify(asOf, asOf), /canonical UTC ISO timestamp/);
  }
});

test('valid leap-day evidence remains admissible at the exact as-of instant', () => {
  const leap = '2028-02-29T20:00:00.000Z';
  assert.equal(classify(leap, leap).unencumberedCashMinor, 100);
});
