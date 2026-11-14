import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

// Removed assets bypass the active-entry classifier; their identifiers must
// nevertheless obey the same prototype-sensitive identity restrictions.
const scope = { tenantId: 'tenant-prototype', entityId: 'entity-prototype', trustId: 'trust-prototype' };
const recorded = { ...scope, eventId: 'record-1', type: 'asset_recorded',
  assetId: 'asset-1', evidenceRef: 'proof-1', occurredAt: '2026-11-10T10:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 500, restrictedMinor: 0, pledgedMinor: 0 };
const removed = { ...scope, eventId: 'remove-1', type: 'asset_removed',
  assetId: 'asset-1', evidenceRef: 'removal-proof',
  occurredAt: '2026-11-10T10:00:00.001Z' };
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-10T10:00:00.003Z', maxEvidenceAgeMs: 86400000, events });

test('removed-event identifiers reject prototype-sensitive names', () => {
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    for (const field of ['eventId', 'evidenceRef']) {
      const bad = { ...removed, [field]: name };
      assert.throws(() => projectReserveJournal(snapshot([recorded, bad])),
        /prototype-sensitive identifier/);
    }
  }
});

test('checkpoint append rejects prototype-sensitive removal receipt without changing predecessor', () => {
  const previous = snapshot([recorded]);
  const digest = projectReserveJournal(previous).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(previous,
    snapshot([recorded, { ...removed, evidenceRef: 'constructor' }]), digest),
  /prototype-sensitive identifier/);
  assert.equal(projectReserveJournal(previous).checkpointSha256, digest);
});

test('ordinary removal identities preserve a valid append', () => {
  const previous = snapshot([recorded]);
  const result = verifyReserveJournalAppend(previous, snapshot([recorded, removed]),
    projectReserveJournal(previous).checkpointSha256);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.activeAssetCount, 0);
});
