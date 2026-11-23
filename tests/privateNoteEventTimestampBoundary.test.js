import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

// This is a structural chronology gate, not evidence of issuance or service.
const scope = { tenantId: 'tenant-time', entityId: 'entity-time',
  trustId: 'trust-time', noteId: 'note-time' };
const issued = { ...scope, eventId: 'issue-time', actorId: 'actor-time',
  type: 'issued', occurredAt: '2026-11-01T12:00:00.000Z',
  documentRef: 'document-time', evidenceRef: 'evidence-time' };
const snapshot = (event) => ({ ...scope, asOfAt: '2026-11-03T00:00:00.000Z',
  events: [event] });

test('private-note event timestamps require canonical millisecond UTC instants', () => {
  for (const invalid of [
    '2026-11-01T12:00:00Z',
    '2026-11-01T12:00:00.000+00:00',
    '2026-11-01T12:00:00.000z',
    '2026-11-01T12:00:00.000Z ',
    '2026-02-30T12:00:00.000Z',
    '2026-11-01T24:00:00.000Z',
    '2026-11-01T12:00:60.000Z',
    1793534400000,
    null,
  ]) {
    assert.throws(() => projectPrivateNoteLifecycle(snapshot({
      ...issued, occurredAt: invalid,
    })), /canonical UTC ISO timestamp/, String(invalid));
  }
  assert.equal(projectPrivateNoteLifecycle(snapshot(issued)).status, 'issued');
});

test('the event at the exact as-of instant is admissible but a later millisecond is not', () => {
  const cutoff = '2026-11-03T00:00:00.000Z';
  assert.equal(projectPrivateNoteLifecycle({
    ...scope, asOfAt: cutoff, events: [{ ...issued, occurredAt: cutoff }],
  }).status, 'issued');
  assert.throws(() => projectPrivateNoteLifecycle({
    ...scope, asOfAt: cutoff,
    events: [{ ...issued, occurredAt: '2026-11-03T00:00:00.001Z' }],
  }), /after snapshot as-of timestamp/);
});
