import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-safe', entityId: 'entity-safe', trustId: 'trust-safe', currency: 'USD' };
const entry = (overrides = {}) => ({
  ...scope, id: 'entry-safe', assetId: 'asset-safe', evidenceRef: 'receipt-safe',
  observedAt: '2026-11-11T00:00:00.000Z',
  kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 125, restrictedMinor: 0, pledgedMinor: 0, ...overrides,
});
const snapshot = (entries, overrides = {}) => ({
  ...scope, asOfAt: '2026-11-11T00:00:00.000Z',
  maxEvidenceAgeMs: 0, entries, ...overrides,
});

test('rejects prototype-sensitive bare IDs in every ownership and evidence role', () => {
  for (const value of ['__proto__', 'constructor', 'prototype']) {
    for (const field of ['tenantId', 'entityId', 'trustId']) {
      assert.throws(() => calculateReserveCapacity(snapshot([entry()], { [field]: value })), /prototype-sensitive identifier/);
    }
    for (const field of ['id', 'assetId', 'evidenceRef']) {
      assert.throws(() => calculateReserveCapacity(snapshot([entry({ [field]: value })])), /prototype-sensitive identifier/);
    }
  }
});

test('accepts prefixed identifiers containing prototype-related words', () => {
  const result = calculateReserveCapacity(snapshot([
    entry({ id: 'entry-constructor', assetId: 'asset-__proto__', evidenceRef: 'receipt-prototype' }),
  ]));
  assert.equal(result.cashTotalMinor, 125);
  assert.equal(result.unencumberedCashMinor, 125);
});
