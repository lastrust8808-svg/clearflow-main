import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-batch', entityId: 'entity-batch', trustId: 'trust-batch' };
const record = (suffix, occurredAt) => ({
  ...scope, type: 'asset_recorded', eventId: 'event-' + suffix,
  assetId: 'asset-' + suffix, evidenceRef: 'evidence-' + suffix,
  occurredAt, currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0,
});
const remove = (suffix, occurredAt) => ({
  ...scope, type: 'asset_removed', eventId: 'remove-' + suffix,
  assetId: 'asset-' + suffix, evidenceRef: 'removal-evidence-' + suffix, occurredAt,
});
const at = (events) => ({
  ...scope, currency: 'USD', asOfAt: '2026-11-11T16:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000, events,
});
const initial = record('first', '2026-11-11T12:00:00.000Z');
const second = record('second', '2026-11-11T13:00:00.000Z');
const removed = remove('first', '2026-11-11T14:00:00.000Z');

test('batch append accepts ordered record and removal while preserving the predecessor', () => {
  const before = at([initial]);
  const after = at([initial, second, removed]);
  const result = verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256);
  assert.equal(result.journalEventCount, 3);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.removedAssetCount, 1);
});

test('batch append rejects a rewritten predecessor even when new events are valid', () => {
  const before = at([initial]);
  const rewritten = { ...initial, amountMinor: 999 };
  assert.throws(() => verifyReserveJournalAppend(before,
    at([rewritten, second, removed]), projectReserveJournal(before).checkpointSha256),
  /cannot rewrite historical events/);
});

test('batch append rejects an out-of-order intermediate event', () => {
  const before = at([initial]);
  const late = record('late', '2026-11-11T15:00:00.000Z');
  assert.throws(() => verifyReserveJournalAppend(before,
    at([initial, late, second]), projectReserveJournal(before).checkpointSha256),
  /timestamps must strictly increase/);
});
