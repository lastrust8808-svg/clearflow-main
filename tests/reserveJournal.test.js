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
  const checkpoint = projectReserveJournal(previousSnapshot).checkpointSha256;
  const nextSnapshot = { ...base, events: [
    Object.fromEntries(Object.entries(record()).reverse()), remove(),
  ] };
  const result = verifyReserveJournalAppend(previousSnapshot, nextSnapshot, checkpoint);
  assert.equal(result.journalEventCount, 2);
  assert.equal(result.activeAssetCount, 0);
  assert.notEqual(result.checkpointSha256, checkpoint);
  assert.equal(Object.isFrozen(result), true);
});

test('checkpointed append rejects stale or malformed checkpoints and history rewrites', () => {
  const previous = { ...base, events: [record()] };
  const next = { ...base, events: [record(), remove()] };
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
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
    projectReserveJournal(next).checkpointSha256), /at least one new event/);
});

test('checkpointed append rejects scope changes, clock rollback and invalid new events', () => {
  const previous = { ...base, events: [record()] };
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
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

test('checkpointed append refuses evidence freshness policy drift, even with otherwise valid replay', () => {
  const previous = { ...base, events: [record()] };
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  const next = { ...base, events: [record(), remove()] };
  assert.equal(projectReserveJournal({ ...next, maxEvidenceAgeMs: 50_400_000 }).journalEventCount, 2);
  assert.throws(() => verifyReserveJournalAppend(previous, {
    ...next, maxEvidenceAgeMs: 50_400_000,
  }, checkpoint), /cannot change evidence freshness policy/);
  assert.throws(() => verifyReserveJournalAppend(previous, {
    ...next, maxEvidenceAgeMs: 172_800_000,
  }, checkpoint), /cannot change evidence freshness policy/);

  // The widened policy would otherwise revive a stale cash classification.
  const added = record({ eventId: 'event-3', assetId: 'asset-2',
    evidenceRef: 'proof-3', occurredAt: '2026-11-03T11:00:00.000Z' });
  const staleUnderOldPolicy = { ...base, asOfAt: '2026-11-03T12:00:00.000Z',
    maxEvidenceAgeMs: 259_200_000, events: [record(), added] };
  assert.equal(projectReserveJournal(staleUnderOldPolicy).activeAssetCount, 2);
  assert.throws(() => verifyReserveJournalAppend(previous, staleUnderOldPolicy, checkpoint),
    /cannot change evidence freshness policy/);
});

test('reserve checkpoint binds as-of time and freshness policy, unlike history-only digest', () => {
  const previous = { ...base, events: [record()] };
  const original = projectReserveJournal(previous);
  const later = { ...previous, asOfAt: '2026-11-02T01:00:00.000Z' };
  const wider = { ...previous, maxEvidenceAgeMs: 172_800_000 };
  const reordered = { ...previous,
    events: [Object.fromEntries(Object.entries(record()).reverse())] };
  assert.match(original.checkpointSha256, /^[0-9a-f]{64}$/);
  assert.equal(projectReserveJournal(reordered).checkpointSha256, original.checkpointSha256);
  assert.equal(projectReserveJournal(later).journalSha256, original.journalSha256);
  assert.equal(projectReserveJournal(wider).journalSha256, original.journalSha256);
  assert.notEqual(projectReserveJournal(later).checkpointSha256, original.checkpointSha256);
  assert.notEqual(projectReserveJournal(wider).checkpointSha256, original.checkpointSha256);

  // A substituted predecessor snapshot cannot silently change the trusted
  // evaluation time or policy, even when both sides of the append agree.
  const next = { ...base, events: [record(), remove()] };
  assert.throws(() => verifyReserveJournalAppend(later, {
    ...next, asOfAt: '2026-11-02T02:00:00.000Z',
  }, original.checkpointSha256), /checkpoint mismatch/);
  assert.throws(() => verifyReserveJournalAppend(wider, {
    ...next, maxEvidenceAgeMs: 172_800_000,
  }, original.checkpointSha256), /checkpoint mismatch/);
});

test('reserve journal identifiers accept valid supplementary Unicode but reject lone surrogates', () => {
  const emoji = '\u{1F512}';
  const valid = record({ assetId: 'asset-' + emoji });
  assert.equal(project([valid]).activeAssetCount, 1);
  for (const invalid of ['asset-\uD800', 'asset-\uDC00', 'asset-\uD800x']) {
    assert.throws(() => project([record({ assetId: invalid })]), /canonical nonempty identifier/);
  }
});


test('reserve journal identifiers reject bidi override and isolate controls', () => {
  for (const invalid of ['asset-\u202E1', 'asset-\u202A1', 'asset-\u20661', 'asset-\u20691']) {
    assert.throws(() => project([record({ assetId: invalid })]), /canonical nonempty identifier/);
    assert.throws(() => project([record({ evidenceRef: invalid })]), /canonical nonempty identifier/);
  }
  assert.equal(project([record({ assetId: 'asset-🔒' })]).activeAssetCount, 1);
});


test('reserve identifiers reject invisible formatting and zero-width spoofing', () => {
  for (const codePoint of [0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2060, 0xFEFF]) {
    const invalid = 'asset-' + String.fromCodePoint(codePoint) + '1';
    assert.throws(() => project([record({ assetId: invalid })]), /canonical nonempty identifier/);
    assert.throws(() => project([record({ evidenceRef: invalid })]), /canonical nonempty identifier/);
    assert.throws(() => projectReserveJournal({ ...base, tenantId: invalid, events: [] }),
      /canonical nonempty identifier/);
  }
  assert.equal(project([record({ assetId: 'asset-🔒' })]).activeAssetCount, 1);
});


test('reserve identifiers reject default-ignorable Unicode including variation selectors', () => {
  for (const codePoint of [0x034F, 0x061C, 0x180E, 0x2061, 0x2064, 0xFE0F, 0xE0100]) {
    const invalid = 'asset-' + String.fromCodePoint(codePoint) + '1';
    assert.throws(() => project([record({ assetId: invalid })]), /canonical nonempty identifier/);
    assert.throws(() => project([record({ evidenceRef: invalid })]), /canonical nonempty identifier/);
    assert.throws(() => projectReserveJournal({ ...base, tenantId: invalid, events: [] }), /canonical nonempty identifier/);
  }
  assert.equal(project([record({ assetId: 'asset-🔒' })]).activeAssetCount, 1);
});

test('reserve identifiers reject Unicode whitespace in all identity positions', () => {
  for (const codePoint of [0x0020, 0x00A0, 0x1680, 0x2003, 0x2028, 0x2029, 0x3000]) {
    const invalid = 'asset-' + String.fromCodePoint(codePoint) + '1';
    assert.throws(() => project([record({ assetId: invalid })]), /canonical nonempty identifier/);
    assert.throws(() => project([record({ eventId: invalid })]), /canonical nonempty identifier/);
    assert.throws(() => project([record({ evidenceRef: invalid })]), /canonical nonempty identifier/);
    assert.throws(() => projectReserveJournal({ ...base, tenantId: invalid, events: [] }),
      /canonical nonempty identifier/);
  }
  assert.equal(project([record({ assetId: 'asset-🔒' })]).activeAssetCount, 1);
});


test('reserve identifiers enforce a bounded length without truncation', () => {
  const maximum = 'a'.repeat(256);
  assert.equal(project([record({ assetId: maximum })]).activeAssetCount, 1);
  for (const oversized of ['a'.repeat(257), '🔒'.repeat(129)]) {
    assert.throws(() => project([record({ assetId: oversized })]), /canonical nonempty identifier/);
    assert.throws(() => project([record({ eventId: oversized })]), /canonical nonempty identifier/);
    assert.throws(() => project([record({ evidenceRef: oversized })]), /canonical nonempty identifier/);
    assert.throws(() => projectReserveJournal({ ...base, tenantId: oversized, events: [] }),
      /canonical nonempty identifier/);
  }
});


test('reserve identities reject Unicode noncharacters across planes and roles', () => {
  for (const cp of [0xFDD0, 0xFDEF, 0xFFFE, 0xFFFF, 0x1FFFE, 0x10FFFF]) {
    const invalid = 'id-' + String.fromCodePoint(cp) + '-suffix';
    for (const key of ['assetId', 'eventId', 'evidenceRef']) {
      assert.throws(() => project([record({ [key]: invalid })]), /canonical nonempty identifier/);
    }
    for (const key of ['tenantId', 'entityId', 'trustId']) {
      assert.throws(() => projectReserveJournal({ ...base, [key]: invalid, events: [] }),
        /canonical nonempty identifier/);
    }
  }
  assert.equal(project([record({ assetId: 'asset-𐐷' })]).activeAssetCount, 1);
});

test('reserve replay and fingerprint ignore a poisoned inherited array iterator', () => {
  const events = [record(), remove()];
  const expected = project(events);
  const original = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
  try {
    Object.defineProperty(Array.prototype, Symbol.iterator, {
      configurable: true, writable: true,
      value: function* () {
        if (this === events) return; // Conceal only the journal's events.
        yield* original.value.call(this);
      },
    });
    const actual = project(events);
    assert.equal(actual.journalEventCount, 2);
    assert.equal(actual.removedAssetCount, 1);
    assert.equal(actual.journalSha256, expected.journalSha256);
    assert.equal(actual.checkpointSha256, expected.checkpointSha256);
  } finally {
    Object.defineProperty(Array.prototype, Symbol.iterator, original);
  }
});


test('reserve replay and fingerprint use validated indexed descriptors, not Proxy reads', () => {
  const original = [record(), remove()];
  const expected = project(original);
  let indexedReads = 0;
  const adversarial = new Proxy(original, {
    get(target, key, receiver) {
      if (key === '0' || key === '1') {
        indexedReads++;
        return key === '0' ? remove() : record();
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const actual = project(adversarial);
  assert.equal(indexedReads, 0);
  assert.equal(actual.journalEventCount, expected.journalEventCount);
  assert.equal(actual.removedAssetCount, expected.removedAssetCount);
  assert.equal(actual.journalSha256, expected.journalSha256);
  assert.equal(actual.checkpointSha256, expected.checkpointSha256);
});
