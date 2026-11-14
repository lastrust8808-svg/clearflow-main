import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const at = '2026-11-10T20:00:00.000Z';
const scope = { tenantId: 'tenant-freshness-zero', entityId: 'entity-freshness-zero', trustId: 'trust-freshness-zero', currency: 'USD' };
const cash = { ...scope, id: 'cash-freshness-zero', assetId: 'asset-freshness-zero', evidenceRef: 'evidence-freshness-zero', observedAt: at, kind: 'cash', sourceType: 'bank_balance', amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0 };
const classify = (maxEvidenceAgeMs, entries) => calculateReserveCapacity({ ...scope, asOfAt: at, maxEvidenceAgeMs, entries });

test('negative-zero evidence freshness policy is rejected even for an empty reserve snapshot', () => {
  assert.throws(() => classify(-0, []), /maxEvidenceAgeMs must be a nonnegative safe integer/);
});

test('negative-zero evidence freshness policy is rejected for cash reserves', () => {
  assert.throws(() => classify(-0, [cash]), /maxEvidenceAgeMs must be a nonnegative safe integer/);
});

test('positive-zero evidence freshness policy admits evidence at exact as-of time', () => {
  const result = classify(0, [cash]);
  assert.equal(result.maxEvidenceAgeMs, 0);
  assert.equal(result.unencumberedCashMinor, 100);
});
