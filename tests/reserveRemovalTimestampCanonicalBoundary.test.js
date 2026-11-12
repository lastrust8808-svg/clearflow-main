import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

// Historical removal timestamps must be canonical UTC instants, even though
// removed assets no longer contribute to the projected reserve balance.
const scope = { tenantId: 'tenant-removal-time', entityId: 'entity-removal-time', trustId: 'trust-removal-time' };
const recorded = { ...scope, eventId: 'record-1', type: 'asset_recorded',
  assetId: 'asset-1', evidenceRef: 'proof-1', occurredAt: '2026-11-10T10:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 500, restrictedMinor: 0, pledgedMinor: 0 };
const removed = { ...scope, eventId: 'remove-1', type: 'asset_removed',
  assetId: 'asset-1', evidenceRef: 'removal-proof',
  occurredAt: '2026-11-10T10:00:00.001Z' };
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-10T10:00:00.003Z', maxEvidenceAgeMs: 86400000, events });

test('historical removal rejects noncanonical or impossible UTC timestamps', () => {
  for (const occurredAt of [
    '2026-11-10T10:00:00Z',
    '2026-11-10T10:00:00.001+00:00',
    '2026-02-30T10:00:00.001Z',
    '2026-11-10T10:00:00.004Z',
  ]) {
    assert.throws(() => projectReserveJournal(snapshot([recorded, { ...removed, occurredAt }])));
  }
});

test('invalid removal timestamp cannot advance authenticated predecessor checkpoint', () => {
  const previous = snapshot([recorded]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(previous,
    snapshot([recorded, { ...removed, occurredAt: '2026-02-30T10:00:00.001Z' }]),
    checkpoint), /canonical UTC timestamp/);
  assert.equal(projectReserveJournal(previous).checkpointSha256, checkpoint);
});

test('canonical removal timestamp permits an otherwise valid append', () => {
  const previous = snapshot([recorded]);
  const result = verifyReserveJournalAppend(previous, snapshot([recorded, removed]),
    projectReserveJournal(previous).checkpointSha256);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.activeAssetCount, 0);
});
