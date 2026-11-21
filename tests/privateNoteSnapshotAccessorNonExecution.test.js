import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = {
  tenantId: 'tenant-snapshot-accessor',
  entityId: 'entity-snapshot-accessor',
  trustId: 'trust-snapshot-accessor',
  noteId: 'note-snapshot-accessor',
};
const valid = () => ({
  ...scope,
  asOfAt: '2026-11-01T00:00:00.000Z',
  events: [{
    ...scope,
    eventId: 'event-snapshot-accessor',
    type: 'issued',
    occurredAt: '2026-10-01T00:00:00.000Z',
    actorId: 'actor-snapshot-accessor',
    documentRef: 'document-snapshot-accessor',
    evidenceRef: 'evidence-snapshot-accessor',
  }],
});

for (const field of ['tenantId', 'entityId', 'trustId', 'noteId', 'asOfAt', 'events']) {
  test('snapshot rejects accessor-backed ' + field + ' without invoking getter', () => {
    const snapshot = valid();
    let invoked = 0;
    Object.defineProperty(snapshot, field, {
      enumerable: true,
      get() { invoked++; throw new Error('untrusted snapshot getter executed'); },
    });
    assert.throws(
      () => projectPrivateNoteLifecycle(snapshot),
      /enumerable data properties/,
    );
    assert.equal(invoked, 0);
  });
}

test('plain snapshot still projects an issued note without asserting legal effectiveness', () => {
  const result = projectPrivateNoteLifecycle(valid());
  assert.equal(result.status, 'issued');
  assert.equal(result.eventCount, 1);
});
