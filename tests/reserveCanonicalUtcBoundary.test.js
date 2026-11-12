import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-time', entityId: 'entity-time', trustId: 'trust-time' };
const recorded = (eventId, assetId, evidenceRef, occurredAt) => ({
  ...scope, type: 'asset_recorded', eventId, assetId, evidenceRef, occurredAt,
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0,
});
const snapshot = (events, asOfAt = '2026-11-11T20:00:00.000Z') => ({
  ...scope, currency: 'USD', asOfAt, maxEvidenceAgeMs: 86_400_000, events,
});

test('reserve replay rejects a nonexistent calendar date rather than normalizing it', () => {
  assert.throws(() => projectReserveJournal(snapshot([
    recorded('event-1', 'asset-1', 'proof-1', '2026-02-29T12:00:00.000Z'),
  ])), /canonical UTC timestamp/);
});

test('reserve replay rejects noncanonical UTC offset and fractional precision', () => {
  for (const occurredAt of ['2026-11-11T12:00:00.000+00:00', '2026-11-11T12:00:00Z',
    '2026-11-11T12:00:00.0000Z']) {
    assert.throws(() => projectReserveJournal(snapshot([
      recorded('event-1', 'asset-1', 'proof-1', occurredAt),
    ])), /canonical UTC timestamp/);
  }
});

test('reserve append accepts a valid later canonical UTC event without changing predecessor', () => {
  const before = snapshot([recorded('event-1', 'asset-1', 'proof-1', '2026-11-11T12:00:00.000Z')]);
  const after = snapshot([...before.events,
    recorded('event-2', 'asset-2', 'proof-2', '2026-11-11T12:00:00.001Z')]);
  const expected = projectReserveJournal(before).checkpointSha256;
  assert.equal(verifyReserveJournalAppend(before, after, expected).journalEventCount, 2);
  assert.equal(projectReserveJournal(before).checkpointSha256, expected);
});
