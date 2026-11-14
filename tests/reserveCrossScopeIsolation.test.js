import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-scope', entityId: 'entity-scope', trustId: 'trust-scope', currency: 'USD' };
const entry = (id, overrides = {}) => ({
  ...scope, id, assetId: 'asset-' + id, evidenceRef: 'evidence-' + id,
  observedAt: '2026-11-11T00:00:00.000Z',
  kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0,
  ...overrides,
});
const snapshot = entries => ({
  ...scope, asOfAt: '2026-11-11T00:00:00.000Z',
  maxEvidenceAgeMs: 0, entries,
});

test('rejects cross-tenant cash records rather than aggregating them', () => {
  assert.throws(
    () => calculateReserveCapacity(snapshot([entry('owned'), entry('foreign', { tenantId: 'another-tenant' })])),
    /scope or currency mismatch/,
  );
});

test('rejects cross-trust collateral regardless of its position', () => {
  const foreign = entry('foreign', {
    trustId: 'another-trust', kind: 'noncash_collateral',
    sourceType: 'private_note', restrictedMinor: 0, pledgedMinor: 0,
  });
  const owned = entry('owned');
  for (const entries of [[foreign, owned], [owned, foreign]]) {
    assert.throws(() => calculateReserveCapacity(snapshot(entries)), /scope or currency mismatch/);
  }
});

test('rejects mixed-currency records without conversion or netting', () => {
  assert.throws(
    () => calculateReserveCapacity(snapshot([entry('usd'), entry('eur', { currency: 'EUR' })])),
    /scope or currency mismatch/,
  );
});
