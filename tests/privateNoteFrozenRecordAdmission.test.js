import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = { tenantId: 'tenant-scope', entityId: 'entity-scope', trustId: 'trust-scope', noteId: 'note-scope' };
const issued = () => ({
  ...scope,
  eventId: 'event-issued',
  type: 'issued',
  occurredAt: '2026-11-14T10:00:00.000Z',
  actorId: 'trustee-actor',
  documentRef: 'note-document',
  evidenceRef: 'issuance-evidence',
});
const snapshot = (events) => ({ ...scope, asOfAt: '2026-11-14T11:00:00.000Z', events });

test('private-note history accepts an ordinary frozen event and snapshot without mutation', () => {
  const event = Object.freeze(issued());
  const events = Object.freeze([event]);
  const record = Object.freeze(snapshot(events));
  assert.deepEqual(projectPrivateNoteLifecycle(record), {
    status: 'issued', eventCount: 1, lastEventId: 'event-issued',
    lastEventAt: '2026-11-14T10:00:00.000Z',
  });
});

test('private-note history rejects a non-enumerable own array element', () => {
  const events = [issued()];
  Object.defineProperty(events, '0', { enumerable: false });
  assert.throws(() => projectPrivateNoteLifecycle(snapshot(events)), /enumerable data elements/);
});

test('private-note history rejects accessor elements without executing their getter', () => {
  let getterCalls = 0;
  const events = [issued()];
  Object.defineProperty(events, '0', { enumerable: true, get() {
    getterCalls++;
    throw new Error('untrusted getter executed');
  } });
  assert.throws(() => projectPrivateNoteLifecycle(snapshot(events)), /enumerable data elements/);
  assert.equal(getterCalls, 0);
});
