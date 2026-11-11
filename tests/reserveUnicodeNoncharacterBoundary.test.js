import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-noncharacter', entityId: 'entity-noncharacter', trustId: 'trust-noncharacter', currency: 'USD' };
const entry = (id, overrides = {}) => ({
  ...scope, id, assetId: 'asset-' + id, evidenceRef: 'receipt-' + id,
  observedAt: '2026-11-11T00:00:00.000Z',
  kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0, ...overrides,
});
const snapshot = entries => ({
  ...scope, asOfAt: '2026-11-11T00:00:00.000Z',
  maxEvidenceAgeMs: 0, entries,
});

test('rejects BMP noncharacter identifiers in asset and evidence roles', () => {
  for (const overrides of [
    { assetId: 'asset-\uFDD0' },
    { evidenceRef: 'receipt-\uFFFF' },
  ]) {
    assert.throws(() => calculateReserveCapacity(snapshot([entry('one', overrides)])), /Unicode noncharacters/);
  }
});

test('rejects supplementary-plane terminal noncharacters across entry orders', () => {
  const invalid = entry('invalid', { assetId: 'asset-\u{1FFFE}' });
  const valid = entry('valid');
  for (const entries of [[invalid, valid], [valid, invalid]]) {
    assert.throws(() => calculateReserveCapacity(snapshot(entries)), /Unicode noncharacters/);
  }
});

test('accepts adjacent valid supplementary scalar values without aliasing', () => {
  const result = calculateReserveCapacity(snapshot([
    entry('first', { assetId: 'asset-\u{1FFFD}' }),
    entry('second', { evidenceRef: 'receipt-\u{20000}' }),
  ]));
  assert.equal(result.cashTotalMinor, 200);
  assert.equal(result.unencumberedCashMinor, 200);
});
