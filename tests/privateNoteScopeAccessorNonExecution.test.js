import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

// Scope claims must never be obtained by executing untrusted event accessors.
const scope = { tenantId: 'tenant-scope-guard', entityId: 'entity-scope-guard', trustId: 'trust-scope-guard', noteId: 'note-scope-guard' };
const issuance = () => ({
  ...scope,
  eventId: 'event-scope-guard',
  type: 'issued',
  occurredAt: '2026-10-01T12:00:00.000Z',
  actorId: 'actor-scope-guard',
  documentRef: 'document-scope-guard',
  evidenceRef: 'evidence-scope-guard',
});
const project = events => projectPrivateNoteLifecycle({ ...scope, asOfAt: '2026-11-01T00:00:00.000Z', events });

for (const field of ['tenantId', 'entityId', 'trustId', 'noteId', 'eventId']) {
  test('rejects accessor-backed event ' + field + ' without executing it', () => {
    const item = issuance();
    let invoked = 0;
    Object.defineProperty(item, field, {
      enumerable: true,
      get() { invoked++; throw new Error('untrusted identity getter executed'); },
    });
    assert.throws(() => project([item]), /enumerable data properties/);
    assert.equal(invoked, 0);
  });
}

test('plain-data scoped issuance remains accepted', () => {
  const result = project([issuance()]);
  assert.equal(result.status, 'issued');
  assert.equal(result.eventCount, 1);
});
