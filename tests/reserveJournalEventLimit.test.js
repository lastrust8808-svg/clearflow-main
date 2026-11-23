import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-limit', entityId: 'entity-limit', trustId: 'trust-limit' };
const event = {
  ...scope, type: 'asset_recorded', eventId: 'event-one', assetId: 'asset-one',
  evidenceRef: 'evidence-one', occurredAt: '2026-11-11T12:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0,
};
const snapshot = events => ({
  ...scope, currency: 'USD', asOfAt: '2026-11-11T20:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000, events,
});

test('reserve replay rejects oversized journal before reading adversarial slots', () => {
  const events = [event];
  events.length = 10001;
  let invoked = false;
  Object.defineProperty(events, '10000', {
    enumerable: true, configurable: true,
    get() { invoked = true; throw new Error('unexpected accessor'); },
  });
  assert.throws(() => projectReserveJournal(snapshot(events)), /maximum event count/);
  assert.equal(invoked, false);
});

test('reserve append rejects oversized proposed journal before reading adversarial slots', () => {
  const before = snapshot([event]);
  const events = [event];
  events.length = 10001;
  let invoked = false;
  Object.defineProperty(events, '10000', {
    enumerable: true, configurable: true,
    get() { invoked = true; throw new Error('unexpected accessor'); },
  });
  assert.throws(() => verifyReserveJournalAppend(
    before, snapshot(events), projectReserveJournal(before).checkpointSha256,
  ), /maximum event count/);
  assert.equal(invoked, false);
});

test('reserve replay accepts a one-event journal below the bounded event limit', () => {
  const result = projectReserveJournal(snapshot([event]));
  assert.equal(result.journalEventCount, 1);
  assert.equal(result.activeAssetCount, 1);
});
