import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-batch-alias', entityId: 'entity-batch-alias', trustId: 'trust-batch-alias' };
const record = (id, time) => ({
  ...scope, type: 'asset_recorded', eventId: 'event-' + id,
  assetId: 'asset-' + id, evidenceRef: 'evidence-' + id,
  occurredAt: time, currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0,
});
const snapshot = events => ({
  ...scope, currency: 'USD', asOfAt: '2026-11-11T20:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000, events,
});
const first = record('first', '2026-11-11T12:00:00.000Z');
const second = record('second', '2026-11-11T13:00:00.000Z');
const third = record('third', '2026-11-11T14:00:00.000Z');
const before = snapshot([first]);
const checkpoint = projectReserveJournal(before).checkpointSha256;

test('batch append rejects new evidence aliasing an earlier event identifier', () => {
  assert.throws(() => verifyReserveJournalAppend(before,
    snapshot([first, { ...second, evidenceRef: first.eventId }, third]), checkpoint),
  /identity namespaces must be distinct/);
});

test('batch append rejects an intermediate event ID aliasing a later asset ID', () => {
  assert.throws(() => verifyReserveJournalAppend(before,
    snapshot([first, { ...second, eventId: third.assetId }, third]), checkpoint),
  /identity namespaces must be distinct/);
});

test('batch append accepts distinct event, asset, and evidence identifiers', () => {
  const result = verifyReserveJournalAppend(before, snapshot([first, second, third]), checkpoint);
  assert.equal(result.journalEventCount, 3);
  assert.equal(result.activeAssetCount, 3);
});
