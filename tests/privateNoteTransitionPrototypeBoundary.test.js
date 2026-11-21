import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = Object.freeze({
  tenantId: 'tenant-note', entityId: 'entity-note',
  trustId: 'trust-note', noteId: 'note-1',
});
const issued = Object.freeze({
  ...scope, eventId: 'evt-1', type: 'issued', actorId: 'trustee-1',
  occurredAt: '2026-10-01T12:00:00.000Z',
  documentRef: 'note-document-1', evidenceRef: 'issuance-receipt-1',
});
const project = events => projectPrivateNoteLifecycle({
  ...scope, asOfAt: '2026-11-01T00:00:00.000Z', events,
});

test('private note transition map cannot be traversed through inherited object names', () => {
  for (const type of ['__proto__', 'constructor', 'prototype', 'toString',
    'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable']) {
    assert.throws(() => project([{ ...issued, type }]),
      /Invalid private note lifecycle transition/, type);
    assert.throws(() => project([issued, {
      ...issued, eventId: 'evt-2', occurredAt: '2026-10-02T12:00:00.000Z',
      documentRef: 'note-document-2', evidenceRef: 'receipt-2', type,
    }]), /Invalid private note lifecycle transition/, type);
  }
  assert.equal(project([issued]).status, 'issued');
});

test('private note event type rejects executable coercion without invoking it', () => {
  let calls = 0;
  const hostile = {
    [Symbol.toPrimitive]() { calls++; throw new Error('executed'); },
    toString() { calls++; throw new Error('executed'); },
  };
  assert.throws(() => project([{ ...issued, type: hostile }]),
    /event type must be a string/);
  assert.equal(calls, 0);
  assert.throws(() => project([{ ...issued, type: Symbol('issued') }]),
    /event type must be a string/);
  assert.equal(project([issued]).status, 'issued');
});
