import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-array-shape', entityId: 'entity-array-shape', trustId: 'trust-array-shape' };
const record = (suffix, occurredAt) => ({
  ...scope, type: 'asset_recorded', eventId: 'event-' + suffix,
  assetId: 'asset-' + suffix, evidenceRef: 'evidence-' + suffix,
  occurredAt, currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0,
});
const snapshot = events => ({
  ...scope, currency: 'USD', asOfAt: '2026-11-11T20:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000, events,
});
const first = record('first', '2026-11-11T12:00:00.000Z');
const second = record('second', '2026-11-11T13:00:00.000Z');
const before = snapshot([first]);
const checkpoint = projectReserveJournal(before).checkpointSha256;

test('append rejects a sparse event array rather than silently skipping a journal slot', () => {
  const events = [first, , second];
  assert.throws(() => verifyReserveJournalAppend(before, snapshot(events), checkpoint),
    /must not contain holes/);
});

test('append rejects an accessor event slot without invoking the accessor', () => {
  const events = [first, second];
  let invoked = false;
  Object.defineProperty(events, '1', {
    enumerable: true, configurable: true,
    get() { invoked = true; throw new Error('untrusted accessor executed'); },
  });
  assert.throws(() => verifyReserveJournalAppend(before, snapshot(events), checkpoint),
    /dense data elements/);
  assert.equal(invoked, false);
});

test('append accepts a dense, own-data event array and preserves its history count', () => {
  const result = verifyReserveJournalAppend(before, snapshot([first, second]), checkpoint);
  assert.equal(result.journalEventCount, 2);
  assert.equal(result.activeAssetCount, 2);
});
