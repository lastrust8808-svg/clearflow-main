import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const at = '2026-11-10T20:00:00.000Z';
const scope = { tenantId: 'tenant-negative-zero', entityId: 'entity-negative-zero', trustId: 'trust-negative-zero', currency: 'USD' };
const cash = { ...scope, id: 'cash-1', assetId: 'asset-cash-1', evidenceRef: 'evidence-cash-1', observedAt: at, kind: 'cash', sourceType: 'bank_balance', amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0 };
const collateral = { ...scope, id: 'note-1', assetId: 'asset-note-1', evidenceRef: 'evidence-note-1', observedAt: at, kind: 'noncash_collateral', sourceType: 'private_note', amountMinor: 100 };
const classify = entries => calculateReserveCapacity({ ...scope, asOfAt: at, maxEvidenceAgeMs: 0, entries });

test('negative zero cannot masquerade as a reported monetary amount or encumbrance', () => {
  for (const field of ['amountMinor', 'restrictedMinor', 'pledgedMinor']) {
    for (const entries of [[{ ...cash, [field]: -0 }, collateral], [collateral, { ...cash, [field]: -0 }]]) {
      assert.throws(() => classify(entries), /nonnegative safe integer/);
    }
  }
});

test('negative zero on noncash collateral is rejected instead of normalized to an explicit zero', () => {
  for (const field of ['amountMinor', 'restrictedMinor', 'pledgedMinor']) {
    for (const entries of [[cash, { ...collateral, [field]: -0 }], [{ ...collateral, [field]: -0 }, cash]]) {
      assert.throws(() => classify(entries), /nonnegative safe integer/);
    }
  }
});

test('positive zero is accepted for explicitly unencumbered cash and noncash metadata', () => {
  const result = classify([{ ...collateral, restrictedMinor: 0, pledgedMinor: 0 }, cash]);
  assert.equal(result.unencumberedCashMinor, 100);
  assert.equal(result.noncashCollateralMinor, 100);
});
