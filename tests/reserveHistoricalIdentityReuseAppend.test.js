import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-reuse', entityId: 'entity-reuse', trustId: 'trust-reuse' };
const record = (eventId, assetId, evidenceRef, occurredAt) => ({
  ...scope, eventId, type: 'asset_recorded', occurredAt, assetId, evidenceRef,
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0
});
const remove = (eventId, assetId, evidenceRef, occurredAt) => ({
  ...scope, eventId, type: 'asset_removed', occurredAt, assetId, evidenceRef
});
const snapshot = events => ({
  ...scope, currency: 'USD', asOfAt: '2026-11-11T14:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000, events
});
const first = record('event-one', 'asset-one', 'receipt-one', '2026-11-11T10:00:00.000Z');
const removal = remove('event-remove', 'asset-one', 'receipt-remove', '2026-11-11T11:00:00.000Z');

test('append rejects reuse of removed asset identity under a new evidence receipt', () => {
  const before = snapshot([first, removal]);
  const after = snapshot([first, removal,
    record('event-two', 'asset-one', 'receipt-two', '2026-11-11T12:00:00.000Z')]);
  assert.throws(() => verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256), /cannot be recorded more than once/);
});

test('append rejects reuse of historical removal evidence for a different asset', () => {
  const before = snapshot([first, removal]);
  const after = snapshot([first, removal,
    record('event-two', 'asset-two', 'receipt-remove', '2026-11-11T12:00:00.000Z')]);
  assert.throws(() => verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256), /Reused reserve journal evidence reference/);
});

test('append permits a new asset with independent identity and evidence after removal', () => {
  const before = snapshot([first, removal]);
  const after = snapshot([first, removal,
    record('event-two', 'asset-two', 'receipt-two', '2026-11-11T12:00:00.000Z')]);
  const result = verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.journalEventCount, 3);
});
