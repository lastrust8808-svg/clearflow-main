import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = Object.freeze({
  tenantId: 'tenant-1', entityId: 'entity-1', trustId: 'trust-1',
  currency: 'USD', asOfAt: '2026-11-15T12:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000,
});
function cash(id, amountMinor, restrictedMinor, pledgedMinor) {
  return {
    id: 'entry-' + id, assetId: 'asset-' + id, evidenceRef: 'receipt-' + id,
    observedAt: '2026-11-15T11:00:00.000Z',
    tenantId: scope.tenantId, entityId: scope.entityId,
    trustId: scope.trustId, currency: scope.currency,
    kind: 'cash', sourceType: 'bank_balance',
    amountMinor, restrictedMinor, pledgedMinor,
  };
}

test('fully pledged and restricted balances produce zero unencumbered cash', () => {
  const result = calculateReserveCapacity({
    ...scope, entries: [cash('a', 10_000, 4_000, 6_000)],
  });
  assert.equal(result.cashTotalMinor, 10_000);
  assert.equal(result.cashRestrictedMinor, 4_000);
  assert.equal(result.cashPledgedMinor, 6_000);
  assert.equal(result.unencumberedCashMinor, 0);
});

test('overlapping restricted and pledged claims cannot produce negative spendable cash', () => {
  assert.throws(() => calculateReserveCapacity({
    ...scope, entries: [cash('a', 10_000, 6_000, 6_000)],
  }), /Restricted plus pledged cash exceeds entry amount/);
});

test('one overencumbered asset invalidates the entire mixed reserve snapshot', () => {
  assert.throws(() => calculateReserveCapacity({
    ...scope, entries: [
      cash('a', 50_000, 0, 0),
      cash('b', 10_000, 7_000, 4_000),
    ],
  }), /Restricted plus pledged cash exceeds entry amount/);
});
