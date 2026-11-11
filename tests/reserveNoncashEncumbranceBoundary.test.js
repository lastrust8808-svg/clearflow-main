import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-noncash', entityId: 'entity-noncash', trustId: 'trust-noncash', currency: 'USD' };
const at = '2026-11-10T20:00:00.000Z';
const make = (id, fields = {}) => ({
  ...scope, id, assetId: 'asset-' + id, evidenceRef: 'evidence-' + id,
  observedAt: at, kind: 'noncash_collateral', sourceType: 'private_note',
  amountMinor: 10000, ...fields,
});
const classify = entries => calculateReserveCapacity({ ...scope, asOfAt: at, maxEvidenceAgeMs: 0, entries });

test('noncash collateral rejects unknown or positive cash encumbrances regardless of entry order', () => {
  const cash = make('cash', { kind: 'cash', sourceType: 'bank_balance', amountMinor: 2000, restrictedMinor: 0, pledgedMinor: 0 });
  for (const field of ['restrictedMinor', 'pledgedMinor']) {
    for (const value of [undefined, null, 1]) {
      const collateral = make('note', { [field]: value });
      for (const entries of [[cash, collateral], [collateral, cash]]) {
        assert.throws(() => classify(entries), /nonnegative safe integer|cannot be classified as restricted\/pledged cash/);
      }
    }
  }
});

test('noncash collateral permits absent or explicitly zero cash encumbrances without increasing available cash', () => {
  const cash = make('cash', { kind: 'cash', sourceType: 'bank_balance', amountMinor: 2000, restrictedMinor: 0, pledgedMinor: 0 });
  for (const note of [make('note'), make('note', { restrictedMinor: 0, pledgedMinor: 0 })]) {
    const result = classify([note, cash]);
    assert.equal(result.noncashCollateralMinor, 10000);
    assert.equal(result.unencumberedCashMinor, 2000);
  }
});
