import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-iterator', entityId: 'entity-iterator', trustId: 'trust-iterator' };
const event = {
  ...scope, type: 'asset_recorded', eventId: 'event-1', assetId: 'asset-1',
  evidenceRef: 'evidence-1', occurredAt: '2026-11-11T12:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0,
};
const snapshot = events => ({
  ...scope, currency: 'USD', asOfAt: '2026-11-11T20:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000, events,
});

test('reserve replay rejects a journal with an own iterator without executing it', () => {
  const events = [event];
  let called = false;
  Object.defineProperty(events, Symbol.iterator, {
    configurable: true, value() { called = true; throw new Error('iterator executed'); },
  });
  assert.throws(() => projectReserveJournal(snapshot(events)), /dense data elements/);
  assert.equal(called, false);
});

test('reserve append rejects an iterator-overridden proposed journal without executing it', () => {
  const before = snapshot([event]);
  const events = [event];
  let called = false;
  Object.defineProperty(events, Symbol.iterator, {
    configurable: true, value() { called = true; throw new Error('iterator executed'); },
  });
  assert.throws(() => verifyReserveJournalAppend(
    before, snapshot(events), projectReserveJournal(before).checkpointSha256,
  ), /dense data elements/);
  assert.equal(called, false);
});

test('reserve replay accepts a standard dense array without an own iterator', () => {
  const result = projectReserveJournal(snapshot([event]));
  assert.equal(result.journalEventCount, 1);
  assert.equal(result.activeAssetCount, 1);
});
