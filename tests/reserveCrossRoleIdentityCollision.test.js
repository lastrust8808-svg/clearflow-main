import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const asOfAt = '2026-11-11T12:00:00.000Z';
function snapshot(entries) {
  return { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
    currency: 'USD', asOfAt, maxEvidenceAgeMs: 60000, entries };
}
function entry(id, assetId, evidenceRef) {
  return { id, assetId, evidenceRef, observedAt: asOfAt,
    tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
    currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
    amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0 };
}

test('reserve rejects entry identifiers reused as assets in either order', () => {
  const first = entry('entry-one', 'asset-one', 'proof-one');
  const second = entry('asset-one', 'asset-two', 'proof-two');
  for (const entries of [[first, second], [second, first]]) {
    assert.throws(() => calculateReserveCapacity(snapshot(entries)), /identifier.*distinct/i);
  }
});

test('reserve rejects evidence references reused as entry IDs in either order', () => {
  const first = entry('entry-one', 'asset-one', 'proof-one');
  const second = entry('proof-one', 'asset-two', 'proof-two');
  for (const entries of [[first, second], [second, first]]) {
    assert.throws(() => calculateReserveCapacity(snapshot(entries)), /identifier.*distinct/i);
  }
});

test('reserve rejects all three scope identifiers reused as asset or evidence identifiers', () => {
  for (const scopeId of ['tenant-a', 'entity-a', 'trust-a']) {
    assert.throws(() => calculateReserveCapacity(snapshot([entry('entry-one', scopeId, 'proof-one')])), /collides with reserve scope/i);
    assert.throws(() => calculateReserveCapacity(snapshot([entry('entry-one', 'asset-one', scopeId)])), /collides with reserve scope/i);
  }
});
