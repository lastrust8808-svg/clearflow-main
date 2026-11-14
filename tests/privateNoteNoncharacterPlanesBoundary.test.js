import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

// Structural admission only; no identity authentication or document execution.
const scope = {
  tenantId: 'tenant-plane', entityId: 'entity-plane',
  trustId: 'trust-plane', noteId: 'note-plane',
};
const issued = {
  ...scope, eventId: 'event-plane', actorId: 'actor-plane',
  type: 'issued', occurredAt: '2026-01-01T00:00:00.000Z',
  documentRef: 'document-plane', evidenceRef: 'evidence-plane',
};
function project(field, value) {
  const event = { ...issued };
  const owner = { ...scope };
  event[field] = value;
  if (Object.hasOwn(owner, field)) owner[field] = value;
  return projectPrivateNoteLifecycle({
    ...owner, asOfAt: '2026-01-02T00:00:00.000Z', events: [event],
  });
}

test('private-note scope and event identities reject Unicode noncharacters on every plane', () => {
  const invalid = ['\\uFDD0', '\\uFDEF', '\\uFFFE', '\\uFFFF',
    String.fromCodePoint(0x1FFFE), String.fromCodePoint(0x1FFFF),
    String.fromCodePoint(0x10FFFE), String.fromCodePoint(0x10FFFF)];
  for (const field of [...Object.keys(scope), 'eventId', 'actorId', 'documentRef', 'evidenceRef']) {
    for (const character of invalid) {
      assert.throws(
        () => project(field, 'valid-' + character),
        /Unicode noncharacters/,
        field + ' U+' + character.codePointAt(0).toString(16),
      );
    }
  }
});

test('private-note identities accept adjacent valid supplementary scalars', () => {
  for (const scalar of [0x1FFFD, 0x20000, 0x10FFFD]) {
    assert.equal(project('actorId', 'actor-' + String.fromCodePoint(scalar)).status, 'issued');
  }
});
