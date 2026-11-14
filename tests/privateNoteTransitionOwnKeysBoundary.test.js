import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

// Regression: transition lookup must use own keys, not inherited Object.prototype
// names, and must never coerce untrusted event-type objects.
const scope = {
  tenantId: 'tenant-transition', entityId: 'entity-transition',
  trustId: 'trust-transition', noteId: 'note-transition',
};
const base = {
  ...scope, eventId: 'event-transition', actorId: 'actor-transition',
  type: 'issued', occurredAt: '2026-01-01T00:00:00.000Z',
  documentRef: 'document-transition', evidenceRef: 'evidence-transition',
};
function project(type) {
  return projectPrivateNoteLifecycle({
    ...scope, asOfAt: '2026-01-02T00:00:00.000Z',
    events: [{ ...base, type }],
  });
}

test('private-note transition rejects inherited object-key names without changing state', () => {
  for (const type of ['__proto__', 'prototype', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
    assert.throws(() => project(type), /Invalid private note lifecycle transition/, type);
  }
  assert.equal(project('issued').status, 'issued');
});

test('private-note transition never coerces hostile event-type objects', () => {
  let coerced = false;
  const hostile = {
    [Symbol.toPrimitive]() { coerced = true; throw new Error('coercion executed'); },
    toString() { coerced = true; throw new Error('coercion executed'); },
  };
  assert.throws(() => project(hostile), /event type must be a string/);
  assert.equal(coerced, false);
  assert.throws(() => project(Symbol('issued')), /event type must be a string/);
});
