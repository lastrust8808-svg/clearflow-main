import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-century', entityId: 'entity-century', trustId: 'trust-century', currency: 'USD' };
function snapshot(at) {
  return { ...scope, asOfAt: at, maxEvidenceAgeMs: 0, entries: [{
    ...scope, id: 'entry-century', assetId: 'asset-century', evidenceRef: 'evidence-century',
    observedAt: at, kind: 'cash', sourceType: 'bank_balance',
    amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0,
  }] };
}

test('reserve evidence rejects February 29 on non-leap century years', () => {
  for (const at of ['1900-02-29T00:00:00.000Z', '2100-02-29T00:00:00.000Z']) {
    assert.throws(() => calculateReserveCapacity(snapshot(at)), /canonical UTC ISO timestamp/);
  }
});

test('reserve evidence accepts February 29 on a leap century year', () => {
  const result = calculateReserveCapacity(snapshot('2000-02-29T00:00:00.000Z'));
  assert.equal(result.unencumberedCashMinor, 100);
});
