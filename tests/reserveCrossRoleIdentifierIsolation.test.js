import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = { tenantId: 'tenant-cross-role', entityId: 'entity-cross-role', trustId: 'trust-cross-role', currency: 'USD' };
const asOfAt = '2026-11-15T12:00:00.000Z';
const cash = (id, assetId, evidenceRef) => ({
  ...scope, id, assetId, evidenceRef, observedAt: asOfAt,
  kind: 'cash', sourceType: 'bank_balance', amountMinor: 100,
  restrictedMinor: 0, pledgedMinor: 0,
});
const classify = entries => calculateReserveCapacity({ ...scope, asOfAt, maxEvidenceAgeMs: 0, entries });

test('entry identifiers cannot impersonate a separate asset or evidence reference', () => {
  assert.throws(() => classify([
    cash('journal-a', 'asset-a', 'proof-a'),
    cash('asset-a', 'asset-b', 'proof-b'),
  ]), /Reserve entry, asset and evidence identifiers must be distinct/);
  assert.throws(() => classify([
    cash('journal-a', 'asset-a', 'proof-a'),
    cash('proof-a', 'asset-b', 'proof-b'),
  ]), /Reserve entry, asset and evidence identifiers must be distinct/);
});

test('asset and evidence cross-role collisions are rejected regardless of order', () => {
  assert.throws(() => classify([
    cash('journal-a', 'asset-a', 'proof-a'),
    cash('journal-b', 'proof-a', 'proof-b'),
  ]), /Reserve asset and evidence identifiers must be distinct/);
  assert.throws(() => classify([
    cash('journal-a', 'asset-a', 'proof-a'),
    cash('journal-b', 'asset-b', 'asset-a'),
  ]), /Reserve asset and evidence identifiers must be distinct/);
});

test('all journal, asset, and evidence IDs must remain distinct from ownership scope', () => {
  for (const [id, assetId, evidenceRef] of [
    [scope.tenantId, 'asset-a', 'proof-a'],
    ['journal-a', scope.entityId, 'proof-a'],
    ['journal-a', 'asset-a', scope.trustId],
  ]) {
    assert.throws(() => classify([cash(id, assetId, evidenceRef)]), /collides with reserve scope/);
  }
});
