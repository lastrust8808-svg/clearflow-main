import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const owner = { tenantId: 'tenant-checkpoint', entityId: 'entity-checkpoint', trustId: 'trust-checkpoint' };
const recorded = { ...owner, eventId: 'event-record', type: 'asset_recorded',
  occurredAt: '2026-11-11T10:00:00.000Z', assetId: 'asset-record',
  evidenceRef: 'receipt-record', currency: 'USD', kind: 'cash',
  sourceType: 'bank_balance', amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0 };
const removed = { ...owner, eventId: 'event-remove', type: 'asset_removed',
  occurredAt: '2026-11-11T11:00:00.000Z', assetId: 'asset-record',
  evidenceRef: 'receipt-remove' };
const snapshot = (events, asOfAt = '2026-11-11T12:00:00.000Z') =>
  ({ ...owner, currency: 'USD', asOfAt, maxEvidenceAgeMs: 86_400_000, events });

test('checkpoint append rejects a rewritten removal receipt even when reserve totals match', () => {
  const previous = snapshot([recorded, removed]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  const replacement = { ...removed, evidenceRef: 'receipt-replaced' };
  const next = snapshot([recorded, replacement, {
    ...recorded, eventId: 'event-new', assetId: 'asset-new',
    evidenceRef: 'receipt-new', occurredAt: '2026-11-11T11:30:00.000Z'
  }]);
  assert.throws(() => verifyReserveJournalAppend(previous, next, checkpoint),
    /rewrite historical events/);
});

test('checkpoint append rejects a forged predecessor checkpoint without accepting the new journal', () => {
  const previous = snapshot([recorded]);
  const next = snapshot([recorded, removed]);
  assert.throws(() => verifyReserveJournalAppend(previous, next, '0'.repeat(64)),
    /predecessor checkpoint mismatch/);
});

test('checkpoint append accepts an unchanged removal receipt and a valid later record', () => {
  const previous = snapshot([recorded, removed]);
  const next = snapshot([recorded, removed, {
    ...recorded, eventId: 'event-new', assetId: 'asset-new',
    evidenceRef: 'receipt-new', occurredAt: '2026-11-11T11:30:00.000Z'
  }]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  const result = verifyReserveJournalAppend(previous, next, checkpoint);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.journalEventCount, 3);
});
