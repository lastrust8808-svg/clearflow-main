import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a' };
const event = { ...scope, eventId: 'event-a', type: 'asset_recorded',
  occurredAt: '2026-11-01T12:00:00.000Z', assetId: 'asset-a', evidenceRef: 'proof-a',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance', amountMinor: 10000, restrictedMinor: 0, pledgedMinor: 0 };
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-02T00:00:00.000Z', maxEvidenceAgeMs: 86_400_000, events });

test('reserve replay and fingerprint use event descriptors, never adversarial event property reads', () => {
  const expected = projectReserveJournal(snapshot([event]));
  let reads = 0;
  const adversarial = new Proxy(event, {
    get(target, key, receiver) {
      if (key === 'amountMinor' || key === 'assetId' || key === 'evidenceRef') {
        reads++;
        return key === 'amountMinor' ? 1 : 'substituted';
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const actual = projectReserveJournal(snapshot([adversarial]));
  assert.equal(reads, 0);
  assert.equal(actual.cashTotalMinor, expected.cashTotalMinor);
  assert.equal(actual.journalSha256, expected.journalSha256);
  assert.equal(actual.checkpointSha256, expected.checkpointSha256);
});


test('append prefix comparison uses descriptor values, not substituted Proxy reads', () => {
  const previous = snapshot([event]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  const removed = { ...scope, eventId: 'event-b', type: 'asset_removed',
    occurredAt: '2026-11-01T13:00:00.000Z', assetId: 'asset-a', evidenceRef: 'proof-b' };
  let reads = 0;
  const hidden = new Proxy(event, {
    get(target, key, receiver) {
      if (key === 'assetId' || key === 'amountMinor') {
        reads++;
        return key === 'assetId' ? 'tampered-asset' : 1;
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const next = snapshot([hidden, removed]);
  const result = verifyReserveJournalAppend(previous, next, checkpoint);
  assert.equal(reads, 0);
  assert.equal(result.journalEventCount, 2);
  assert.equal(result.activeAssetCount, 0);
});

test('reserve journal rejects symbol-keyed accessors without invoking them', () => {
  let calls = 0;
  const symbol = Symbol('untrusted-metadata');
  const record = { ...event };
  Object.defineProperty(record, symbol, {
    enumerable: true,
    get() { calls++; throw new Error('getter must not execute'); },
  });
  assert.throws(() => projectReserveJournal(snapshot([record])),
    /Unsupported Reserve journal event field/);
  const events = [event];
  Object.defineProperty(events, symbol, {
    enumerable: true,
    get() { calls++; throw new Error('getter must not execute'); },
  });
  assert.throws(() => projectReserveJournal(snapshot(events)),
    /Reserve journal must contain only dense data elements/);
  assert.equal(calls, 0);
});

test('reserve projection snapshots policy and event descriptors without Proxy get reads', () => {
  const baseline = projectReserveJournal(snapshot([event]));
  let reads = 0;
  const input = new Proxy(snapshot([event]), {
    get(target, key, receiver) {
      if (key === 'currency' || key === 'asOfAt' || key === 'events') {
        reads++;
        throw new Error('snapshot get trap must not execute');
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const actual = projectReserveJournal(input);
  assert.equal(reads, 0);
  assert.equal(actual.journalSha256, baseline.journalSha256);
  assert.equal(actual.checkpointSha256, baseline.checkpointSha256);
});

test('reserve append uses snapshot descriptors without reading adversarial Proxy properties', () => {
  const previous = snapshot([event]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  const removed = { ...scope, eventId: 'event-b', type: 'asset_removed',
    occurredAt: '2026-11-01T13:00:00.000Z', assetId: 'asset-a', evidenceRef: 'proof-b' };
  const next = snapshot([event, removed]);
  let reads = 0;
  const adversarial = value => new Proxy(value, {
    get(target, key, receiver) {
      if (['tenantId', 'entityId', 'trustId', 'currency', 'asOfAt',
        'maxEvidenceAgeMs', 'events'].includes(key)) {
        reads++;
        throw new Error('append must not invoke snapshot get trap');
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const result = verifyReserveJournalAppend(adversarial(previous), adversarial(next), checkpoint);
  assert.equal(reads, 0);
  assert.equal(result.journalEventCount, 2);
  assert.equal(result.activeAssetCount, 0);
});

test('reserve replay and append never invoke adversarial array index reads', () => {
  const previous = snapshot([event]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  const removed = { ...scope, eventId: 'event-b', type: 'asset_removed',
    occurredAt: '2026-11-01T13:00:00.000Z', assetId: 'asset-a', evidenceRef: 'proof-b' };
  let reads = 0;
  const adversarial = elements => new Proxy(elements, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^(0|1)$/.test(key)) {
        reads++;
        throw new Error('array index get trap must not execute');
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const projected = projectReserveJournal(snapshot(adversarial([event])));
  assert.equal(projected.checkpointSha256, checkpoint);
  const appended = verifyReserveJournalAppend(
    snapshot(adversarial([event])),
    snapshot(adversarial([event, removed])),
    checkpoint,
  );
  assert.equal(appended.journalEventCount, 2);
  assert.equal(appended.activeAssetCount, 0);
  assert.equal(reads, 0);
});


test('append requires a real new event even when a Proxy forges array length reads', () => {
  const previous = snapshot([event]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  let lengthReads = 0;
  const forged = new Proxy([event], {
    get(target, key, receiver) {
      if (key === 'length') {
        lengthReads++;
        return 2;
      }
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => verifyReserveJournalAppend(previous, snapshot(forged), checkpoint),
    /at least one new event/);
  assert.equal(lengthReads, 0);
});

test('append rejects rewritten historical descriptors despite forged Proxy index reads', () => {
  const previous = snapshot([event]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  const rewritten = { ...event, amountMinor: 9000 };
  const removed = { ...scope, eventId: 'event-b', type: 'asset_removed',
    occurredAt: '2026-11-01T13:00:00.000Z', assetId: 'asset-a', evidenceRef: 'proof-b' };
  let indexReads = 0;
  const disguised = new Proxy([rewritten, removed], {
    get(target, key, receiver) {
      if (key === '0') {
        indexReads++;
        return event;
      }
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(
    () => verifyReserveJournalAppend(previous, snapshot(disguised), checkpoint),
    /rewrite historical events/,
  );
  assert.equal(indexReads, 0);
});
