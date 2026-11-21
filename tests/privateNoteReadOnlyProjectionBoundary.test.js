import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

function snapshot() {
  return {
    tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', noteId: 'note-a',
    asOfAt: '2026-11-15T12:00:00.000Z',
    events: [{
      eventId: 'event-a', tenantId: 'tenant-a', entityId: 'entity-a',
      trustId: 'trust-a', noteId: 'note-a', type: 'issued',
      occurredAt: '2026-11-15T11:00:00.000Z',
      actorId: 'actor-a', documentRef: 'document-a', evidenceRef: 'evidence-a',
    }],
  };
}

test('private note projection does not mutate frozen caller records', () => {
  const record = snapshot();
  Object.freeze(record.events[0]);
  Object.freeze(record.events);
  Object.freeze(record);
  const before = JSON.stringify(record);
  const result = projectPrivateNoteLifecycle(record);
  assert.equal(JSON.stringify(record), before);
  assert.deepEqual(result, {
    status: 'issued', eventCount: 1, lastEventId: 'event-a',
    lastEventAt: '2026-11-15T11:00:00.000Z',
  });
  assert.ok(Object.isFrozen(result));
});

test('private note projection accepts own data records with null prototypes', () => {
  const record = snapshot();
  record.events[0] = Object.assign(Object.create(null), record.events[0]);
  const nullRecord = Object.assign(Object.create(null), record);
  assert.equal(projectPrivateNoteLifecycle(nullRecord).status, 'issued');
});

test('private note projection cannot return a mutable status object', () => {
  const result = projectPrivateNoteLifecycle(snapshot());
  assert.throws(() => { result.status = 'presented'; }, TypeError);
  assert.equal(result.status, 'issued');
});
