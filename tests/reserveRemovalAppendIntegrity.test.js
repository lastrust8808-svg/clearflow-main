import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a' };
const base = { ...scope, currency: 'USD', asOfAt: '2026-11-11T12:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000 };
const recorded = () => ({ ...scope, eventId: 'event-1', type: 'asset_recorded',
  occurredAt: '2026-11-11T10:00:00.000Z', assetId: 'asset-1',
  evidenceRef: 'proof-1', currency: 'USD', kind: 'cash',
  sourceType: 'bank_balance', amountMinor: 1000,
  restrictedMinor: 0, pledgedMinor: 0 });
const removed = () => ({ ...scope, eventId: 'event-2', type: 'asset_removed',
  occurredAt: '2026-11-11T11:00:00.000Z', assetId: 'asset-1',
  evidenceRef: 'proof-2' });
const previous = () => ({ ...base, events: [recorded(), removed()] });
const next = () => ({ ...base, events: [recorded(), removed(), {
  ...recorded(), eventId: 'event-3', assetId: 'asset-2',
  evidenceRef: 'proof-3', occurredAt: '2026-11-11T11:30:00.000Z',
}] });
const checkpoint = () => projectReserveJournal(previous()).checkpointSha256;

test('append accepts unchanged removal history with reordered object properties', () => {
  const candidate = next();
  candidate.events[1] = Object.fromEntries(Object.entries(candidate.events[1]).reverse());
  const result = verifyReserveJournalAppend(previous(), candidate, checkpoint());
  assert.equal(result.journalEventCount, 3);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.activeAssetCount, 1);
});

test('append rejects rewritten historical removal evidence even when final capacity matches', () => {
  const candidate = next();
  candidate.events[1].evidenceRef = 'proof-forged';
  assert.equal(projectReserveJournal(candidate).cashTotalMinor, 1000);
  assert.throws(() => verifyReserveJournalAppend(previous(), candidate, checkpoint()),
    /rewrite historical events/);
});

test('append rejects rewritten historical removal timestamp even when replay remains valid', () => {
  const candidate = next();
  candidate.events[1].occurredAt = '2026-11-11T11:01:00.000Z';
  assert.equal(projectReserveJournal(candidate).removedAssetCount, 1);
  assert.throws(() => verifyReserveJournalAppend(previous(), candidate, checkpoint()),
    /rewrite historical events/);
});
