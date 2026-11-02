import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal } from '../server/services/reserveJournal.js';

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
  assert.throws(() => project([record(), record({ eventId: 'event-3', occurredAt: '2026-11-01T14:00:00.000Z' })]),
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
