import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const base = () => ({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', noteId: 'note-a',
  asOfAt: '2026-11-15T12:00:00.000Z',
  events: [{
    eventId: 'event-a', tenantId: 'tenant-a', entityId: 'entity-a',
    trustId: 'trust-a', noteId: 'note-a', type: 'issued',
    occurredAt: '2026-11-15T11:00:00.000Z',
    actorId: 'actor-a', documentRef: 'document-a', evidenceRef: 'evidence-a',
  }],
});

test('private note history rejects own Symbol.iterator without invoking getter', () => {
  const snapshot = base();
  let invoked = 0;
  Object.defineProperty(snapshot.events, Symbol.iterator, {
    enumerable: false,
    get() { invoked++; throw new Error('iterator executed'); },
  });
  assert.throws(() => projectPrivateNoteLifecycle(snapshot), /only array indices/);
  assert.equal(invoked, 0);
});

test('private note history rejects an own iterator data property', () => {
  const snapshot = base();
  Object.defineProperty(snapshot.events, Symbol.iterator, {
    value: function* () { throw new Error('iterator executed'); },
    enumerable: false,
  });
  assert.throws(() => projectPrivateNoteLifecycle(snapshot), /only array indices/);
});

test('private note history rejects own non-index string metadata without executing getter', () => {
  const snapshot = base();
  let invoked = 0;
  Object.defineProperty(snapshot.events, 'toJSON', {
    get() { invoked++; throw new Error('metadata executed'); },
  });
  assert.throws(() => projectPrivateNoteLifecycle(snapshot), /only array indices/);
  assert.equal(invoked, 0);
});

test('private note valid dense history remains accepted', () => {
  assert.deepEqual(projectPrivateNoteLifecycle(base()), {
    status: 'issued', eventCount: 1, lastEventId: 'event-a',
    lastEventAt: '2026-11-15T11:00:00.000Z',
  });
});
