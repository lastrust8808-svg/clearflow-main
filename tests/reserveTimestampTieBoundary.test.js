import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-time-edge', entityId: 'entity-time-edge', trustId: 'trust-time-edge' };
const recorded = (eventId, assetId, evidenceRef, occurredAt) => ({
  ...scope, eventId, assetId, evidenceRef, occurredAt,
  type: 'asset_recorded', currency: 'USD', kind: 'cash',
  sourceType: 'bank_balance', amountMinor: 100,
  restrictedMinor: 0, pledgedMinor: 0,
});
const snapshot = (events, asOfAt = '2026-11-12T12:00:00.002Z') => ({
  ...scope, currency: 'USD', asOfAt, maxEvidenceAgeMs: 86_400_000, events,
});

test('reserve journal rejects two events sharing the same millisecond', () => {
  const events = [
    recorded('event-a', 'asset-a', 'evidence-a', '2026-11-12T12:00:00.000Z'),
    recorded('event-b', 'asset-b', 'evidence-b', '2026-11-12T12:00:00.000Z'),
  ];
  assert.throws(() => projectReserveJournal(snapshot(events)), /timestamps must strictly increase/);
});

test('reserve append rejects a new event at its predecessor timestamp', () => {
  const first = recorded('event-a', 'asset-a', 'evidence-a', '2026-11-12T12:00:00.000Z');
  const before = snapshot([first]);
  const after = snapshot([first,
    recorded('event-b', 'asset-b', 'evidence-b', '2026-11-12T12:00:00.000Z'),
  ]);
  assert.throws(() => verifyReserveJournalAppend(
    before, after, projectReserveJournal(before).checkpointSha256,
  ), /timestamps must strictly increase/);
});

test('reserve append accepts an event one millisecond later at the as-of boundary', () => {
  const first = recorded('event-a', 'asset-a', 'evidence-a', '2026-11-12T12:00:00.000Z');
  const before = snapshot([first], '2026-11-12T12:00:00.001Z');
  const after = snapshot([first,
    recorded('event-b', 'asset-b', 'evidence-b', '2026-11-12T12:00:00.002Z'),
  ]);
  const result = verifyReserveJournalAppend(
    before, after, projectReserveJournal(before).checkpointSha256,
  );
  assert.equal(result.journalEventCount, 2);
  assert.equal(result.activeAssetCount, 2);
});
