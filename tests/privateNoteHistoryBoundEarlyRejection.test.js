import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

function snapshot(events) {
  return {
    tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', noteId: 'note-a',
    asOfAt: '2026-11-15T12:00:00.000Z', events,
  };
}

test('oversized private-note history fails before reading an accessor event', () => {
  const events = new Array(10001);
  let calls = 0;
  Object.defineProperty(events, '0', {
    enumerable: true, configurable: true,
    get() { calls++; throw new Error('untrusted event accessor executed'); },
  });
  assert.throws(
    () => projectPrivateNoteLifecycle(snapshot(events)),
    /maximum event count/,
  );
  assert.equal(calls, 0);
});

test('oversized private-note history rejects without enumerating event descriptors', () => {
  const events = new Array(10001);
  let calls = 0;
  const proxied = new Proxy(events, {
    ownKeys(target) { calls++; return Reflect.ownKeys(target); },
  });
  assert.throws(
    () => projectPrivateNoteLifecycle(snapshot(proxied)),
    /maximum event count/,
  );
  assert.equal(calls, 0);
});
