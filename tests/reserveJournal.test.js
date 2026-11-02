import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a' };
const base = { ...scope, currency: 'USD', asOfAt: '2026-11-02T00:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000 };
const record = (overrides = {}) => ({ ...scope, eventId: 'event-1', type: 'asset_recorded',
  occurredAt: '2026-11-01T12:00:00.000Z', assetId: 'asset-1', evidenceRef: 'proof-1',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 10000, restrictedMinor: 2000, pledgedMinor: 1000, ...overrides });
const remove = (overrides = {}) => ({ ...scope, eventId: 'event-2', type: 'asset_removed',
  occurredAt: '2026-11-01T13:00:00.000Z', assetId: 'asset-1', evidenceRef: 'proof-2',
  ...overrides });
const project = events => projectReserveJournal({ ...base, events });

test('replays recorded reserves without posting funds and freezes projection', () => {
  const events = [record()];
  const before = structuredClone(events);
  const result = project(events);
  assert.equal(result.cashTotalMinor, 10000);
  assert.equal(result.unencumberedCashMinor, 7000);
  assert.equal(result.journalEventCount, 1);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.removedAssetCount, 0);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(events, before);
});
test('removal eliminates reserve classification but does not claim legal release', () => {
  const result = project([record(), remove()]);
  assert.equal(result.cashTotalMinor, 0);
  assert.equal(result.activeAssetCount, 0);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.journalEventCount, 2);
  assert.equal(project([]).journalEventCount, 0);
});
test('rejects replay, unrecorded removal, re-recording and out-of-order history', () => {
  assert.throws(() => project([remove()]), /currently recorded asset/);
  assert.throws(() => project([record(), record({ eventId: 'event-3', evidenceRef: 'proof-3', occurredAt: '2026-11-01T14:00:00.000Z' })]),
    /more than once/);
  assert.throws(() => project([record(), remove(), record({ eventId: 'event-3',
    evidenceRef: 'proof-3', occurredAt: '2026-11-01T14:00:00.000Z' })]), /more than once/);
  assert.throws(() => project([record(), remove({ eventId: 'event-1' })]), /Duplicate.*event ID/);
  assert.throws(() => project([record(), remove({ evidenceRef: 'proof-1' })]), /Reused.*evidence/);
  assert.throws(() => project([record(), remove({ occurredAt: '2026-11-01T12:00:00.000Z' })]),
    /strictly increase/);
  assert.throws(() => project([record(), remove({ occurredAt: '2026-11-01T11:00:00.000Z' })]),
    /strictly increase/);
});
test('rejects cross-scope, future, stale and invalid historical cash claims', () => {
  assert.throws(() => project([record({ tenantId: 'other-tenant' })]), /scope mismatch/);
  assert.throws(() => project([record({ occurredAt: '2026-11-03T12:00:00.000Z' })]), /after as-of/);
  assert.throws(() => projectReserveJournal({ ...base, asOfAt: '2026-11-05T00:00:00.000Z',
    events: [record()] }), /maximum age/);
  assert.throws(() => project([record({ restrictedMinor: 9000, pledgedMinor: 2000 }), remove()]),
    /exceeds entry amount/);
  assert.throws(() => project([record({ restrictedMinor: null }), remove()]), /restrictedMinor/);
});
test('rejects extra legal claims and hidden/accessor metadata before reading getters', () => {
  assert.throws(() => project([remove({ lienReleased: true })]), /Unsupported/);
  assert.throws(() => project([record({ fundsSettled: true })]), /Unsupported/);
  const accessor = record();
  let calls = 0;
  Object.defineProperty(accessor, 'amountMinor', { enumerable: true,
    get() { calls++; return 10000; } });
  assert.throws(() => project([accessor]), /enumerable data properties/);
  assert.equal(calls, 0);
  const sparse = [record(), , remove()];
  assert.throws(() => project(sparse), /holes/);
});
test('rejects cross-role identifier reuse including removed historical assets', () => {
  assert.throws(() => project([record({ eventId: 'asset-1' })]), /distinct/);
  assert.throws(() => project([record({ evidenceRef: 'asset-1' })]), /distinct/);
  assert.throws(() => project([record(), remove({ evidenceRef: 'asset-1' })]), /distinct/);
  assert.throws(() => project([record(), remove({ eventId: 'tenant-a' })]), /distinct/);
  assert.equal(project([record(), remove()]).activeAssetCount, 0);
});


test('canonical SHA-256 journal fingerprint detects event changes without depending on object key order or as-of policy', () => {
  const events = [record(), remove()];
  const fingerprint = project(events).journalSha256;
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  const reordered = events.map(event => Object.fromEntries(Object.entries(event).reverse()));
  assert.equal(project(reordered).journalSha256, fingerprint);
  assert.equal(projectReserveJournal({ ...base, asOfAt: '2026-11-02T01:00:00.000Z',
    events }).journalSha256, fingerprint);
  assert.notEqual(project([record()]).journalSha256, fingerprint);
  assert.notEqual(project([record({ amountMinor: 10001 }), remove()]).journalSha256, fingerprint);
  assert.notEqual(project([record(), remove({ evidenceRef: 'proof-3' })]).journalSha256,
    fingerprint);
  assert.notEqual(projectReserveJournal({ ...base, trustId: 'trust-b',
    events: events.map(event => ({ ...event, trustId: 'trust-b' })) }).journalSha256,
    fingerprint);
});


test('checkpointed append accepts only new events with an unchanged canonical history', () => {
  const previousSnapshot = { ...base, events: [record()] };
  const checkpoint = projectReserveJournal(previousSnapshot).journalSha256;
  const nextSnapshot = { ...base, events: [
    Object.fromEntries(Object.entries(record()).reverse()), remove(),
  ] };
  const result = verifyReserveJournalAppend(previousSnapshot, nextSnapshot, checkpoint);
  assert.equal(result.journalEventCount, 2);
  assert.equal(result.activeAssetCount, 0);
  assert.notEqual(result.journalSha256, checkpoint);
  assert.equal(Object.isFrozen(result), true);
});

test('checkpointed append rejects stale or malformed checkpoints and history rewrites', () => {
  const previous = { ...base, events: [record()] };
  const next = { ...base, events: [record(), remove()] };
  const checkpoint = projectReserveJournal(previous).journalSha256;
  assert.throws(() => verifyReserveJournalAppend(previous, next, 'A'.repeat(64)),
    /lowercase SHA-256/);
  assert.throws(() => verifyReserveJournalAppend(previous, next, '0'.repeat(64)),
    /checkpoint mismatch/);
  assert.throws(() => verifyReserveJournalAppend(previous, { ...next,
    events: [record({ amountMinor: 10001 }), remove()] }, checkpoint),
    /rewrite historical/);
  assert.throws(() => verifyReserveJournalAppend(previous, previous, checkpoint),
    /at least one new event/);
  assert.throws(() => verifyReserveJournalAppend(next, previous,
    projectReserveJournal(next).journalSha256), /at least one new event/);
});

test('checkpointed append rejects scope changes, clock rollback and invalid new events', () => {
  const previous = { ...base, events: [record()] };
  const checkpoint = projectReserveJournal(previous).journalSha256;
  const next = { ...base, events: [record(), remove()] };
  assert.throws(() => verifyReserveJournalAppend(previous, {
    ...next, asOfAt: '2026-11-01T20:00:00.000Z',
  }, checkpoint), /roll back as-of/);
  const newScope = { ...scope, trustId: 'trust-b' };
  assert.throws(() => verifyReserveJournalAppend(previous, {
    ...next, ...newScope, events: next.events.map(event => ({ ...event, ...newScope })),
  }, checkpoint), /change owner scope/);
  assert.throws(() => verifyReserveJournalAppend(previous, {
    ...next, currency: 'EUR', events: [record({ currency: 'EUR' }), remove()],
  }, checkpoint), /change owner scope or currency/);
  assert.throws(() => verifyReserveJournalAppend(previous, {
    ...next, events: [record(), remove({ eventId: 'event-1' })],
  }, checkpoint), /Duplicate.*event ID/);
});
