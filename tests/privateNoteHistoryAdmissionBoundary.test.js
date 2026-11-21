import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = { tenantId: 'tenant-limit', entityId: 'entity-limit', trustId: 'trust-limit', noteId: 'note-limit' };
const issued = { ...scope, eventId: 'event-limit', actorId: 'actor-limit', type: 'issued',
  occurredAt: '2026-01-01T00:00:00.000Z', documentRef: 'document-limit', evidenceRef: 'evidence-limit' };
const project = events => projectPrivateNoteLifecycle({
  ...scope, asOfAt: '2026-01-02T00:00:00.000Z', events,
});

test('private-note journal refuses oversized history before projecting even the first event', () => {
  const oversized = Array(10001).fill(issued);
  assert.throws(() => project(oversized), /maximum event count/);
});

test('private-note journal rejects sparse, inherited, accessor and symbol metadata arrays', () => {
  const sparse = new Array(2);
  sparse[0] = issued;
  assert.throws(() => project(sparse), /holes/);

  const inherited = [issued];
  Object.setPrototypeOf(inherited, Object.create(Array.prototype));
  assert.throws(() => project(inherited), /plain array/);

  const accessor = [issued];
  Object.defineProperty(accessor, '0', { get() { throw Error('untrusted getter executed'); }, enumerable: true, configurable: true });
  assert.throws(() => project(accessor), /enumerable data elements/);

  const symbolic = [issued];
  symbolic[Symbol('hidden evidence')] = 'not-a-journal-entry';
  assert.throws(() => project(symbolic), /only array indices/);
});

test('private-note journal admits a dense ordinary array without claiming authenticated issuance', () => {
  assert.deepEqual(project([issued]), {
    status: 'issued', eventCount: 1, lastEventId: 'event-limit',
    lastEventAt: '2026-01-01T00:00:00.000Z',
  });
});
