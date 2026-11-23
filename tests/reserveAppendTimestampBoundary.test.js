import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-order', entityId: 'entity-order', trustId: 'trust-order' };
const recorded = (eventId, assetId, evidenceRef, occurredAt) => ({
  ...scope, eventId, assetId, evidenceRef, occurredAt, type: 'asset_recorded',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0
});
const snapshot = events => ({
  ...scope, currency: 'USD', asOfAt: '2026-11-11T16:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000, events
});
const first = recorded('event-first', 'asset-first', 'evidence-first', '2026-11-11T12:00:00.000Z');

test('append rejects a distinct event at the exact predecessor millisecond', () => {
  const before = snapshot([first]);
  const after = snapshot([first,
    recorded('event-second', 'asset-second', 'evidence-second', first.occurredAt)]);
  assert.throws(() => verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256), /timestamps must strictly increase/);
});

test('append rejects a backdated event even when its identifiers are unique', () => {
  const before = snapshot([first]);
  const after = snapshot([first,
    recorded('event-second', 'asset-second', 'evidence-second', '2026-11-11T11:59:59.999Z')]);
  assert.throws(() => verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256), /timestamps must strictly increase/);
});

test('append accepts a later millisecond with independent evidence and identity', () => {
  const before = snapshot([first]);
  const after = snapshot([first,
    recorded('event-second', 'asset-second', 'evidence-second', '2026-11-11T12:00:00.001Z')]);
  const result = verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256);
  assert.equal(result.journalEventCount, 2);
  assert.equal(result.activeAssetCount, 2);
  assert.notEqual(result.checkpointSha256, projectReserveJournal(before).checkpointSha256);
});
