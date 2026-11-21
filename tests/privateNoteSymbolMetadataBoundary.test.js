import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = { tenantId: 'tenant-symbol', entityId: 'entity-symbol', trustId: 'trust-symbol', noteId: 'note-symbol' };
const snapshot = () => ({
  ...scope,
  asOfAt: '2026-11-14T00:00:00.000Z',
  events: [{
    ...scope, eventId: 'event-symbol', type: 'issued',
    occurredAt: '2026-11-13T00:00:00.000Z',
    actorId: 'actor-symbol', documentRef: 'document-symbol',
    evidenceRef: 'evidence-symbol',
  }],
});

test('private-note snapshot rejects enumerable symbol metadata', () => {
  const record = snapshot();
  record[Symbol('unreviewed-metadata')] = 'ignored-if-enumerating-strings-only';
  assert.throws(() => projectPrivateNoteLifecycle(record), /Unsupported private note snapshot field/);
});

test('private-note event rejects enumerable symbol metadata', () => {
  const record = snapshot();
  record.events[0][Symbol('unreviewed-metadata')] = 'ignored-if-enumerating-strings-only';
  assert.throws(() => projectPrivateNoteLifecycle(record), /Unsupported private note lifecycle event field/);
});

test('private-note history rejects symbol-keyed metadata', () => {
  const record = snapshot();
  record.events[Symbol('hidden-event')] = record.events[0];
  assert.throws(() => projectPrivateNoteLifecycle(record), /only array indices/);
});

test('private-note projection still admits ordinary issuance without legal-effect claims', () => {
  assert.deepEqual(projectPrivateNoteLifecycle(snapshot()), {
    status: 'issued', eventCount: 1,
    lastEventId: 'event-symbol', lastEventAt: '2026-11-13T00:00:00.000Z',
  });
});
