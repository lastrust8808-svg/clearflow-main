import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = { tenantId: 'tenant-transition', entityId: 'entity-transition', trustId: 'trust-transition', noteId: 'note-transition' };
function snapshot(type) {
  return {
    ...scope,
    asOfAt: '2026-11-15T00:00:00.000Z',
    events: [{
      ...scope,
      eventId: 'event-transition',
      type,
      occurredAt: '2026-11-14T00:00:00.000Z',
      actorId: 'actor-transition',
      documentRef: 'document-transition',
      evidenceRef: 'evidence-transition',
    }],
  };
}

for (const type of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty']) {
  test('private-note transition rejects inherited/prototype property name: ' + type, () => {
    assert.throws(() => projectPrivateNoteLifecycle(snapshot(type)), /Invalid private note lifecycle transition/);
  });
}

test('private-note transition does not coerce object-valued event types', () => {
  let calls = 0;
  const type = { toString() { calls++; throw Error('untrusted coercion'); } };
  assert.throws(() => projectPrivateNoteLifecycle(snapshot(type)), /event type must be a string/);
  assert.equal(calls, 0);
});

test('private-note transition accepts reviewed issuance control', () => {
  assert.deepEqual(projectPrivateNoteLifecycle(snapshot('issued')), {
    status: 'issued',
    eventCount: 1,
    lastEventId: 'event-transition',
    lastEventAt: '2026-11-14T00:00:00.000Z',
  });
});
