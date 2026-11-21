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

for (const key of ['01', '-1', '1.0', '4294967295', 'constructor', '__proto__']) {
  test('private note history rejects noncanonical array key ' + key, () => {
    const record = snapshot();
    Object.defineProperty(record.events, key, {
      configurable: true, enumerable: true, writable: true, value: 'untrusted',
    });
    assert.throws(() => projectPrivateNoteLifecycle(record), /only array indices/);
  });
}

test('private note history accepts a frozen dense data array without mutation', () => {
  const record = snapshot();
  Object.freeze(record.events[0]);
  Object.freeze(record.events);
  const projection = projectPrivateNoteLifecycle(record);
  assert.deepEqual(projection, {
    status: 'issued', eventCount: 1, lastEventId: 'event-a',
    lastEventAt: '2026-11-15T11:00:00.000Z',
  });
  assert.ok(Object.isFrozen(projection));
});
