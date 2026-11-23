import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-double-removal', entityId: 'entity-double-removal', trustId: 'trust-double-removal' };
const recorded = { ...scope, eventId: 'event-record', type: 'asset_recorded',
  assetId: 'asset-once', evidenceRef: 'evidence-record', occurredAt: '2026-11-10T10:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 900, restrictedMinor: 100, pledgedMinor: 0 };
const removed = { ...scope, eventId: 'event-remove', type: 'asset_removed',
  assetId: 'asset-once', evidenceRef: 'evidence-remove', occurredAt: '2026-11-10T10:00:00.001Z' };
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-10T10:00:00.004Z', maxEvidenceAgeMs: 86400000, events });

test('second removal of the same historical asset is rejected with distinct receipt and event ID', () => {
  assert.throws(() => projectReserveJournal(snapshot([recorded, removed, {
    ...removed, eventId: 'event-remove-again', evidenceRef: 'evidence-remove-again',
    occurredAt: '2026-11-10T10:00:00.002Z',
  }])), /currently recorded asset/);
});

test('rejected duplicate removal append does not change predecessor checkpoint', () => {
  const previous = snapshot([recorded, removed]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  const next = snapshot([...previous.events, {
    ...removed, eventId: 'event-remove-again', evidenceRef: 'evidence-remove-again',
    occurredAt: '2026-11-10T10:00:00.002Z',
  }]);
  assert.throws(() => verifyReserveJournalAppend(previous, next, checkpoint),
    /currently recorded asset/);
  assert.equal(projectReserveJournal(previous).checkpointSha256, checkpoint);
});

test('distinct asset can be recorded after removal without restoring removed asset capacity', () => {
  const previous = snapshot([recorded, removed]);
  const next = snapshot([...previous.events, {
    ...recorded, eventId: 'event-record-new', assetId: 'asset-new',
    evidenceRef: 'evidence-record-new', occurredAt: '2026-11-10T10:00:00.002Z',
    amountMinor: 300, restrictedMinor: 0,
  }]);
  const projection = verifyReserveJournalAppend(previous, next,
    projectReserveJournal(previous).checkpointSha256);
  assert.equal(projection.removedAssetCount, 1);
  assert.equal(projection.activeAssetCount, 1);
  assert.equal(projection.unencumberedCashMinor, 300);
});
