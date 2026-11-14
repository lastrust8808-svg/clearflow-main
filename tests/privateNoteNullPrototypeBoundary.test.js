import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = {
  tenantId: 'tenant-null-prototype', entityId: 'entity-null-prototype',
  trustId: 'trust-null-prototype', noteId: 'note-null-prototype',
};
const event = {
  ...scope, eventId: 'event-null-prototype', actorId: 'actor-null-prototype',
  type: 'issued', occurredAt: '2026-01-01T00:00:00.000Z',
  documentRef: 'document-null-prototype', evidenceRef: 'evidence-null-prototype',
};
const project = (events, overrides = {}) => projectPrivateNoteLifecycle({
  ...scope, asOfAt: '2026-01-02T00:00:00.000Z', events, ...overrides,
});

test('private-note projection admits complete null-prototype data records', () => {
  const record = Object.assign(Object.create(null), event);
  const snapshot = Object.assign(Object.create(null), {
    ...scope, asOfAt: '2026-01-02T00:00:00.000Z', events: [record],
  });
  const result = projectPrivateNoteLifecycle(snapshot);
  assert.deepEqual(result, {
    status: 'issued', eventCount: 1,
    lastEventId: event.eventId, lastEventAt: event.occurredAt,
  });
  assert.equal(Object.isFrozen(result), true);
});

test('private-note projection rejects inherited event fields despite matching values', () => {
  const inherited = Object.create({ actorId: event.actorId });
  Object.assign(inherited, { ...event, actorId: undefined });
  delete inherited.actorId;
  assert.throws(() => project([inherited]), /plain data record/);
});

test('private-note projection rejects inherited snapshot fields despite matching scope', () => {
  const inherited = Object.create({ tenantId: scope.tenantId });
  Object.assign(inherited, {
    entityId: scope.entityId, trustId: scope.trustId, noteId: scope.noteId,
    asOfAt: '2026-01-02T00:00:00.000Z', events: [event],
  });
  assert.throws(() => projectPrivateNoteLifecycle(inherited), /plain data record/);
});
