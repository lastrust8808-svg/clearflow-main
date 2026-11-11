import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-roles', entityId: 'entity-roles', trustId: 'trust-roles', currency: 'USD' };
const at = '2026-11-11T00:00:00.000Z';
const entry = (id, assetId, evidenceRef) => ({
  ...scope, id, assetId, evidenceRef, observedAt: at,
  kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0,
});
const snapshot = entries => ({ ...scope, asOfAt: at, maxEvidenceAgeMs: 0, entries });

test('reserve entry identifier cannot alias another asset identifier in either order', () => {
  const a = entry('entry-a', 'asset-a', 'evidence-a');
  const b = entry('asset-a', 'asset-b', 'evidence-b');
  for (const entries of [[a, b], [b, a]]) {
    assert.throws(() => calculateReserveCapacity(snapshot(entries)), /entry, asset and evidence identifiers must be distinct/);
  }
});

test('reserve entry identifier cannot alias another evidence identifier in either order', () => {
  const a = entry('entry-a', 'asset-a', 'evidence-a');
  const b = entry('evidence-a', 'asset-b', 'evidence-b');
  for (const entries of [[a, b], [b, a]]) {
    assert.throws(() => calculateReserveCapacity(snapshot(entries)), /entry, asset and evidence identifiers must be distinct/);
  }
});

test('reserve identifiers remain independent when each role is unique', () => {
  const result = calculateReserveCapacity(snapshot([
    entry('entry-a', 'asset-a', 'evidence-a'),
    entry('entry-b', 'asset-b', 'evidence-b'),
  ]));
  assert.equal(result.unencumberedCashMinor, 200);
});
