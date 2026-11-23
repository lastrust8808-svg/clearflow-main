import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

// Chronology is a supplied-data invariant, not proof of service or legal default.
const scope = { tenantId: 'tenant-chronology', entityId: 'entity-chronology',
  trustId: 'trust-chronology', noteId: 'note-chronology' };
const issued = { ...scope, eventId: 'event-issue', actorId: 'trustee-one',
  type: 'issued', occurredAt: '2026-11-01T12:00:00.000Z',
  documentRef: 'note-document', evidenceRef: 'issue-receipt' };
const presented = { ...scope, eventId: 'event-present', actorId: 'trustee-one',
  type: 'presented', occurredAt: '2026-11-01T12:01:00.000Z',
  documentRef: 'note-document', evidenceRef: 'present-receipt' };
const snapshot = (events, asOfAt = '2026-11-02T00:00:00.000Z') =>
  ({ ...scope, asOfAt, events });

test('an event after the snapshot cutoff cannot establish an issued or presented state', () => {
  assert.throws(() => projectPrivateNoteLifecycle(snapshot([issued], '2026-11-01T11:59:59.999Z')),
    /after snapshot as-of timestamp/);
  assert.throws(() => projectPrivateNoteLifecycle(snapshot([issued, presented],
    '2026-11-01T12:00:30.000Z')), /after snapshot as-of timestamp/);
  assert.equal(projectPrivateNoteLifecycle(snapshot([issued],
    '2026-11-01T12:00:00.000Z')).status, 'issued');
});

test('journal ordering rejects duplicate instants and out-of-order events', () => {
  assert.throws(() => projectPrivateNoteLifecycle(snapshot([
    issued, { ...presented, occurredAt: issued.occurredAt },
  ])), /strictly increasing timestamps/);
  assert.throws(() => projectPrivateNoteLifecycle(snapshot([
    issued, { ...presented, occurredAt: '2026-11-01T11:59:59.999Z' },
  ])), /strictly increasing timestamps/);
  const result = projectPrivateNoteLifecycle(snapshot([issued, presented]));
  assert.deepEqual(result, {
    status: 'presented', eventCount: 2, lastEventId: 'event-present',
    lastEventAt: presented.occurredAt,
  });
});

test('noncanonical or invalid cutoff instants fail closed', () => {
  for (const invalid of ['2026-11-02', '2026-11-02T00:00:00Z',
    '2026-11-02T00:00:00.000+00:00', '2026-02-30T00:00:00.000Z',
    '2026-11-02T00:00:00.000z', null]) {
    assert.throws(() => projectPrivateNoteLifecycle(snapshot([issued], invalid)),
      /canonical UTC ISO timestamp/);
  }
});
