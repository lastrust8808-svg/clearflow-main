import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

// A removed asset is historical evidence: its identifiers must remain portable
// and canonical even when it contributes nothing to current reserve capacity.
const scope = { tenantId: 'tenant-removal-unicode', entityId: 'entity-removal-unicode', trustId: 'trust-removal-unicode' };
const recorded = { ...scope, eventId: 'record-1', type: 'asset_recorded',
  assetId: 'asset-1', evidenceRef: 'record-proof', occurredAt: '2026-11-10T10:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 500, restrictedMinor: 0, pledgedMinor: 0 };
const removed = { ...scope, eventId: 'remove-1', type: 'asset_removed',
  assetId: 'asset-1', evidenceRef: 'remove-proof', occurredAt: '2026-11-10T10:00:00.001Z' };
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-10T10:00:00.003Z', maxEvidenceAgeMs: 86400000, events });

test('historical removal rejects noncanonical and noncharacter evidence identifiers', () => {
  for (const evidenceRef of ['e\u0301', 'proof\u200b', 'proof\ufdd0', 'proof\u{1ffff}', 'proof\ud800']) {
    assert.throws(() => projectReserveJournal(snapshot([recorded, { ...removed, evidenceRef }])),
      /canonical nonempty identifier/);
  }
});

test('invalid historical removal evidence cannot advance a checkpointed append', () => {
  const previous = snapshot([recorded]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(previous,
    snapshot([recorded, { ...removed, evidenceRef: 'proof\u{1ffff}' }]), checkpoint),
    /canonical nonempty identifier/);
  assert.equal(projectReserveJournal(previous).checkpointSha256, checkpoint);
});

test('canonical Unicode removal evidence remains admissible', () => {
  const previous = snapshot([recorded]);
  const next = snapshot([recorded, { ...removed, evidenceRef: 'preuve-é' }]);
  const result = verifyReserveJournalAppend(previous, next,
    projectReserveJournal(previous).checkpointSha256);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.activeAssetCount, 0);
});
