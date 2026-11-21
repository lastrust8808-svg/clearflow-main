import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-removal-prefix', entityId: 'entity-removal-prefix', trustId: 'trust-removal-prefix' };
const recorded = (id, at) => ({
  ...scope, eventId: id, type: 'asset_recorded', assetId: 'asset-original',
  evidenceRef: 'evidence-original', occurredAt: at, currency: 'USD',
  kind: 'cash', sourceType: 'bank_balance', amountMinor: 100,
  restrictedMinor: 0, pledgedMinor: 0,
});
const removed = (id, evidence, at) => ({
  ...scope, eventId: id, type: 'asset_removed', assetId: 'asset-original',
  evidenceRef: evidence, occurredAt: at,
});
const snapshot = (events, asOfAt) => ({
  ...scope, currency: 'USD', maxEvidenceAgeMs: 86_400_000, asOfAt, events,
});

test('append preserves a historical removal and accepts a later independent asset', () => {
  const first = recorded('event-original', '2026-11-12T10:00:00.000Z');
  const removal = removed('event-removal', 'evidence-removal', '2026-11-12T10:00:00.001Z');
  const before = snapshot([first, removal], '2026-11-12T10:00:00.002Z');
  const next = snapshot([first, removal, {
    ...recorded('event-new', '2026-11-12T10:00:00.003Z'),
    assetId: 'asset-new', evidenceRef: 'evidence-new',
  }], '2026-11-12T10:00:00.003Z');
  const result = verifyReserveJournalAppend(before, next, projectReserveJournal(before).checkpointSha256);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.journalEventCount, 3);
});

test('append rejects a rewritten historical removal receipt', () => {
  const first = recorded('event-original', '2026-11-12T10:00:00.000Z');
  const removal = removed('event-removal', 'evidence-removal', '2026-11-12T10:00:00.001Z');
  const before = snapshot([first, removal], '2026-11-12T10:00:00.002Z');
  const next = snapshot([first, { ...removal, evidenceRef: 'evidence-substituted' }, {
    ...recorded('event-new', '2026-11-12T10:00:00.003Z'),
    assetId: 'asset-new', evidenceRef: 'evidence-new',
  }], '2026-11-12T10:00:00.003Z');
  assert.throws(() => verifyReserveJournalAppend(
    before, next, projectReserveJournal(before).checkpointSha256,
  ), /cannot rewrite historical events/);
});
