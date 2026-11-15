import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const snapshot = events => ({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', noteId: 'note-a',
  asOfAt: '2026-11-15T12:00:00.000Z', events,
});

test('private-note history fails closed when a proxy denies length descriptor inspection', () => {
  let eventReads = 0;
  const events = [null];
  Object.defineProperty(events, '0', {
    configurable: true, enumerable: true,
    get() { eventReads++; throw new Error('event getter executed'); },
  });
  const proxied = new Proxy(events, {
    getOwnPropertyDescriptor(target, key) {
      if (key === 'length') throw new Error('length descriptor unavailable');
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.throws(() => projectPrivateNoteLifecycle(snapshot(proxied)), /length descriptor unavailable/);
  assert.equal(eventReads, 0);
});

test('private-note history fails closed when descriptor enumeration throws', () => {
  let eventReads = 0;
  const events = [null];
  Object.defineProperty(events, '0', {
    configurable: true, enumerable: true,
    get() { eventReads++; throw new Error('event getter executed'); },
  });
  const proxied = new Proxy(events, {
    ownKeys() { throw new Error('history enumeration unavailable'); },
  });
  assert.throws(() => projectPrivateNoteLifecycle(snapshot(proxied)), /history enumeration unavailable/);
  assert.equal(eventReads, 0);
});

test('private-note history rejects inconsistent proxy descriptor metadata without reading event accessors', () => {
  const events = [null];
  let eventReads = 0;
  Object.defineProperty(events, '0', {
    configurable: true, enumerable: true,
    get() { eventReads++; throw new Error('event getter executed'); },
  });
  assert.throws(() => projectPrivateNoteLifecycle(snapshot(events)), /enumerable data elements/);
  assert.equal(eventReads, 0);
});
