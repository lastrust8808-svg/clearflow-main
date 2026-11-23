import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

// Pure projection admission; not proof of authorization, issuance or delivery.
const scope = Object.freeze({
  tenantId: 'tenant-length', entityId: 'entity-length',
  trustId: 'trust-length', noteId: 'note-length',
});
const issued = Object.freeze({
  ...scope, eventId: 'event-length', actorId: 'actor-length',
  type: 'issued', occurredAt: '2026-01-01T00:00:00.000Z',
  documentRef: 'document-length', evidenceRef: 'evidence-length',
});
function project(event, overrides = {}) {
  return projectPrivateNoteLifecycle({
    ...scope, ...overrides, asOfAt: '2026-01-02T00:00:00.000Z',
    events: [event],
  });
}

test('private-note event and evidence identifiers accept exactly 256 UTF-16 code units', () => {
  for (const field of ['eventId', 'actorId', 'documentRef', 'evidenceRef']) {
    const result = project({ ...issued, [field]: 'x'.repeat(256) });
    assert.equal(result.status, 'issued', field);
  }
});

test('private-note event and evidence identifiers reject 257 UTF-16 code units', () => {
  for (const field of ['eventId', 'actorId', 'documentRef', 'evidenceRef']) {
    assert.throws(
      () => project({ ...issued, [field]: 'x'.repeat(257) }),
      /maximum identifier length/, field,
    );
  }
});

test('private-note scope identifiers enforce the same length boundary', () => {
  for (const field of ['tenantId', 'entityId', 'trustId', 'noteId']) {
    const accepted = 'x'.repeat(256);
    assert.equal(project({ ...issued, [field]: accepted }, { [field]: accepted }).status, 'issued');
    assert.throws(
      () => project({ ...issued, [field]: 'x'.repeat(257) }, { [field]: 'x'.repeat(257) }),
      /maximum identifier length/, field,
    );
  }
});

test('supplementary Unicode counts as two UTF-16 units at the boundary', () => {
  assert.equal(project({ ...issued, actorId: 'x'.repeat(254) + '🌿' }).status, 'issued');
  assert.throws(
    () => project({ ...issued, actorId: 'x'.repeat(255) + '🌿' }),
    /maximum identifier length/,
  );
});
