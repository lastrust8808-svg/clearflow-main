import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-unicode', entityId: 'entity-unicode', trustId: 'trust-unicode', currency: 'USD' };
const entry = (id, overrides = {}) => ({
  ...scope, id, assetId: 'asset-' + id, evidenceRef: 'evidence-' + id,
  observedAt: '2026-11-11T00:00:00.000Z',
  kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0, ...overrides,
});
const snapshot = entries => ({
  ...scope, asOfAt: '2026-11-11T00:00:00.000Z',
  maxEvidenceAgeMs: 0, entries,
});

test('rejects canonically equivalent decomposed asset identifiers before double counting', () => {
  const canonical = entry('first', { assetId: 'asset-\u00e9' });
  const decomposed = entry('second', { assetId: 'asset-e\u0301' });
  for (const entries of [[canonical, decomposed], [decomposed, canonical]]) {
    assert.throws(() => calculateReserveCapacity(snapshot(entries)), /NFC-normalized Unicode/);
  }
});

test('rejects decomposed evidence identifiers rather than treating them as independent receipts', () => {
  const canonical = entry('first', { evidenceRef: 'receipt-\u00e9' });
  const decomposed = entry('second', { evidenceRef: 'receipt-e\u0301' });
  assert.throws(() => calculateReserveCapacity(snapshot([canonical, decomposed])), /NFC-normalized Unicode/);
});

test('accepts distinct NFC identifiers with supplementary Unicode scalar values', () => {
  const result = calculateReserveCapacity(snapshot([
    entry('first', { assetId: 'asset-\u{1f680}', evidenceRef: 'receipt-\u{1f680}' }),
    entry('second', { assetId: 'asset-\u{1f6f0}', evidenceRef: 'receipt-\u{1f6f0}' }),
  ]));
  assert.equal(result.cashTotalMinor, 200);
  assert.equal(result.unencumberedCashMinor, 200);
});
