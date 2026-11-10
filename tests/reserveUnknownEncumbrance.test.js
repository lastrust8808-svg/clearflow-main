import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-unknown', entityId: 'entity-unknown', trustId: 'trust-unknown', currency: 'USD' };
const asOfAt = '2026-11-10T16:00:00.000Z';
const entry = (id, overrides = {}) => ({
  id, assetId: 'asset-' + id, evidenceRef: 'evidence-' + id,
  ...scope, observedAt: asOfAt, kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0, ...overrides,
});
const classify = entries => calculateReserveCapacity({
  ...scope, asOfAt, maxEvidenceAgeMs: 0, entries,
});

test('unknown cash encumbrance never becomes zero, even beside valid cash', () => {
  const good = entry('good');
  for (const field of ['restrictedMinor', 'pledgedMinor']) {
    for (const unknown of [undefined, null]) {
      const bad = entry('bad', { [field]: unknown });
      for (const entries of [[good, bad], [bad, good]]) {
        assert.throws(() => classify(entries), /nonnegative safe integer/);
      }
    }
    const missing = entry('missing');
    delete missing[field];
    for (const entries of [[good, missing], [missing, good]]) {
      assert.throws(() => classify(entries), /require explicit restrictedMinor and pledgedMinor/);
    }
  }
});

test('explicit zero encumbrances admit cash but never promote a private note', () => {
  const result = classify([
    entry('cash'),
    entry('note', { kind: 'noncash_collateral', sourceType: 'private_note', amountMinor: 500000 }),
  ]);
  assert.equal(result.unencumberedCashMinor, 1000);
  assert.equal(result.noncashCollateralMinor, 500000);
});
