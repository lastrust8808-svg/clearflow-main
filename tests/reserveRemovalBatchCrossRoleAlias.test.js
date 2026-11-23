import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-removal-alias', entityId: 'entity-removal-alias', trustId: 'trust-removal-alias' };
const recorded = (id, occurredAt) => ({
  ...scope, type: 'asset_recorded', eventId: 'event-' + id, assetId: 'asset-' + id,
  evidenceRef: 'evidence-' + id, occurredAt, currency: 'USD', kind: 'cash',
  sourceType: 'bank_balance', amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0,
});
const removed = (assetId, id, occurredAt) => ({
  ...scope, type: 'asset_removed', eventId: 'remove-' + id, assetId,
  evidenceRef: 'removal-evidence-' + id, occurredAt,
});
const snapshot = events => ({
  ...scope, currency: 'USD', asOfAt: '2026-11-11T20:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000, events,
});
const first = recorded('first', '2026-11-11T12:00:00.000Z');
const before = snapshot([first]);
const checkpoint = projectReserveJournal(before).checkpointSha256;

test('batch append rejects removal receipt aliasing a later recorded asset ID', () => {
  const removal = removed(first.assetId, 'first', '2026-11-11T13:00:00.000Z');
  const next = recorded('second', '2026-11-11T14:00:00.000Z');
  assert.throws(() => verifyReserveJournalAppend(before,
    snapshot([first, { ...removal, evidenceRef: next.assetId }, next]), checkpoint),
  /identity namespaces must be distinct/);
});

test('batch append rejects removal event ID aliasing a later evidence receipt', () => {
  const removal = removed(first.assetId, 'first', '2026-11-11T13:00:00.000Z');
  const next = recorded('second', '2026-11-11T14:00:00.000Z');
  assert.throws(() => verifyReserveJournalAppend(before,
    snapshot([first, { ...removal, eventId: next.evidenceRef }, next]), checkpoint),
  /identity namespaces must be distinct/);
});

test('batch append accepts independent removal and replacement identities', () => {
  const removal = removed(first.assetId, 'first', '2026-11-11T13:00:00.000Z');
  const next = recorded('second', '2026-11-11T14:00:00.000Z');
  const result = verifyReserveJournalAppend(before, snapshot([first, removal, next]), checkpoint);
  assert.equal(result.journalEventCount, 3);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.removedAssetCount, 1);
});
