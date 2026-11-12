import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-freshness-removal', entityId: 'entity-freshness-removal', trustId: 'trust-freshness-removal' };
const recorded = {
  ...scope, eventId: 'event-cash-recorded', type: 'asset_recorded',
  assetId: 'asset-cash', evidenceRef: 'receipt-cash',
  occurredAt: '2026-11-10T10:00:00.000Z', currency: 'USD',
  kind: 'cash', sourceType: 'bank_balance', amountMinor: 1000,
  restrictedMinor: 0, pledgedMinor: 0,
};
const removed = {
  ...scope, eventId: 'event-cash-removed', type: 'asset_removed',
  assetId: 'asset-cash', evidenceRef: 'receipt-cash-removal',
  occurredAt: '2026-11-10T10:00:00.001Z',
};
const snapshot = (events, asOfAt, maxEvidenceAgeMs = 86_400_000) => ({
  ...scope, currency: 'USD', asOfAt, maxEvidenceAgeMs, events,
});

test('removed historical cash never contributes to capacity even when its original evidence is fresh', () => {
  const result = projectReserveJournal(snapshot([recorded, removed], '2026-11-10T10:00:00.002Z'));
  assert.equal(result.activeAssetCount, 0);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.journalEventCount, 2);
});

test('removed historical cash stays excluded after its evidence becomes stale', () => {
  const result = projectReserveJournal(snapshot([recorded, removed], '2026-11-12T10:00:00.000Z'));
  assert.equal(result.activeAssetCount, 0);
  assert.equal(result.removedAssetCount, 1);
});

test('append cannot resurrect removed cash by extending evidence freshness policy', () => {
  const previous = snapshot([recorded, removed], '2026-11-10T10:00:00.002Z');
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  const next = snapshot([recorded, removed, {
    ...scope, eventId: 'event-new', type: 'asset_recorded', assetId: 'asset-new',
    evidenceRef: 'receipt-new', occurredAt: '2026-11-10T10:00:00.003Z',
    currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
    amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0,
  }], '2026-11-10T10:00:00.003Z', 172_800_000);
  assert.throws(() => verifyReserveJournalAppend(previous, next, checkpoint),
    /cannot change evidence freshness policy/);
  assert.equal(projectReserveJournal(previous).checkpointSha256, checkpoint);
});
