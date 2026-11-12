import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-digest', entityId: 'entity-digest', trustId: 'trust-digest' };
const event = {
  ...scope, eventId: 'event-digest', type: 'asset_recorded',
  occurredAt: '2026-11-11T12:00:00.000Z', assetId: 'asset-digest',
  evidenceRef: 'evidence-digest', currency: 'USD', kind: 'cash',
  sourceType: 'bank_balance', amountMinor: 1200, restrictedMinor: 0, pledgedMinor: 0,
};
const snapshot = (events, asOfAt = '2026-11-11T12:00:00.000Z') => ({
  ...scope, currency: 'USD', asOfAt, maxEvidenceAgeMs: 86400000, events,
});

test('reserve journal fingerprints are independent of event property insertion order', () => {
  const reversed = Object.fromEntries(Object.entries(event).reverse());
  const a = projectReserveJournal(snapshot([event]));
  const b = projectReserveJournal(snapshot([reversed]));
  assert.equal(a.journalSha256, b.journalSha256);
  assert.equal(a.checkpointSha256, b.checkpointSha256);
});

test('reserve history digest stays fixed while as-of checkpoint changes', () => {
  const a = projectReserveJournal(snapshot([event]));
  const b = projectReserveJournal(snapshot([event], '2026-11-11T12:00:00.001Z'));
  assert.equal(a.journalSha256, b.journalSha256);
  assert.notEqual(a.checkpointSha256, b.checkpointSha256);
});

test('append refuses a history digest substituted for authenticated predecessor checkpoint', () => {
  const before = snapshot([event]);
  const after = snapshot([event, {
    ...scope, eventId: 'event-digest-2', type: 'asset_recorded',
    occurredAt: '2026-11-11T12:00:00.001Z', assetId: 'asset-digest-2',
    evidenceRef: 'evidence-digest-2', currency: 'USD', kind: 'cash',
    sourceType: 'bank_balance', amountMinor: 200, restrictedMinor: 0, pledgedMinor: 0,
  }], '2026-11-11T12:00:00.001Z');
  const predecessor = projectReserveJournal(before);
  assert.throws(() => verifyReserveJournalAppend(before, after, predecessor.journalSha256),
    /predecessor checkpoint mismatch/);
  assert.equal(verifyReserveJournalAppend(before, after, predecessor.checkpointSha256).journalEventCount, 2);
});
