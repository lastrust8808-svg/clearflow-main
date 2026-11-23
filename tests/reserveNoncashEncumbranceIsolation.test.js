import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-collateral', entityId: 'entity-collateral', trustId: 'trust-collateral', currency: 'USD' };
const asOfAt = '2026-11-10T16:00:00.000Z';
const cash = { id: 'cash-entry', assetId: 'cash-asset', evidenceRef: 'cash-evidence', ...scope, observedAt: asOfAt, kind: 'cash', sourceType: 'bank_balance', amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0 };
const collateral = { id: 'note-entry', assetId: 'note-asset', evidenceRef: 'note-evidence', ...scope, observedAt: asOfAt, kind: 'noncash_collateral', sourceType: 'private_note', amountMinor: 500000 };
const classify = entries => calculateReserveCapacity({ ...scope, asOfAt, maxEvidenceAgeMs: 0, entries });

test('noncash collateral rejects any nonzero cash encumbrance regardless of ordering', () => {
  for (const field of ['restrictedMinor', 'pledgedMinor']) {
    for (const value of [1, Number.MAX_SAFE_INTEGER]) {
      const invalid = { ...collateral, [field]: value };
      for (const entries of [[cash, invalid], [invalid, cash]]) {
        assert.throws(() => classify(entries), /Noncash collateral cannot be classified/);
      }
    }
  }
});

test('noncash collateral admits explicit zero cash fields without increasing available cash', () => {
  for (const entries of [[cash, { ...collateral, restrictedMinor: 0, pledgedMinor: 0 }], [{ ...collateral, restrictedMinor: 0, pledgedMinor: 0 }, cash]]) {
    const result = classify(entries);
    assert.equal(result.cashTotalMinor, 1000);
    assert.equal(result.unencumberedCashMinor, 1000);
    assert.equal(result.noncashCollateralMinor, 500000);
  }
});
