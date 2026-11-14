import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-removal-reuse', entityId: 'entity-removal-reuse', trustId: 'trust-removal-reuse' };
const first = { ...scope, eventId: 'record-1', type: 'asset_recorded', assetId: 'cash-1',
  evidenceRef: 'proof-1', occurredAt: '2026-11-10T10:00:00.000Z', currency: 'USD',
  kind: 'cash', sourceType: 'bank_balance', amountMinor: 500,
  restrictedMinor: 0, pledgedMinor: 0 };
const removal = { ...scope, eventId: 'remove-1', type: 'asset_removed',
  assetId: 'cash-1', evidenceRef: 'proof-removal',
  occurredAt: '2026-11-10T10:00:00.001Z' };
const again = { ...first, eventId: 'record-2', evidenceRef: 'proof-2',
  occurredAt: '2026-11-10T10:00:00.002Z', amountMinor: 900 };
const snapshot = (events, asOfAt = '2026-11-10T10:00:00.003Z') => ({
  ...scope, currency: 'USD', asOfAt, maxEvidenceAgeMs: 86400000, events
});

test('removed asset ID cannot be re-recorded with a new receipt and event ID', () => {
  assert.throws(() => projectReserveJournal(snapshot([first, removal, again])),
    /cannot be recorded more than once/);
});

test('append validation rejects resurrection and retains predecessor checkpoint', () => {
  const previous = snapshot([first, removal]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(previous,
    snapshot([first, removal, again]), checkpoint), /cannot be recorded more than once/);
  assert.equal(projectReserveJournal(previous).checkpointSha256, checkpoint);
});

test('distinct new asset after historical removal remains admissible', () => {
  const previous = snapshot([first, removal]);
  const next = snapshot([first, removal, { ...again, assetId: 'cash-2' }]);
  const result = verifyReserveJournalAppend(previous, next,
    projectReserveJournal(previous).checkpointSha256);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.journalEventCount, 3);
});
