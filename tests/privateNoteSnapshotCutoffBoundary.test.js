import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

// A caller-supplied cutoff is only a structural input; the integrated API
// must supply a trusted server clock and authenticate the journal separately.
const scope = { tenantId: 'tenant-cutoff', entityId: 'entity-cutoff',
  trustId: 'trust-cutoff', noteId: 'note-cutoff' };
const event = { ...scope, eventId: 'event-cutoff', actorId: 'actor-cutoff',
  type: 'issued', occurredAt: '2024-02-29T23:59:59.999Z',
  documentRef: 'document-cutoff', evidenceRef: 'evidence-cutoff' };
const project = (asOfAt) => projectPrivateNoteLifecycle({
  ...scope, asOfAt, events: [event],
});

test('private-note snapshot cutoff rejects noncanonical UTC and impossible calendar dates', () => {
  for (const invalid of [
    '2024-02-29T23:59:59Z',
    '2024-02-29T23:59:59.999+00:00',
    '2024-02-29T23:59:59.999z',
    '2024-02-29T23:59:59.999Z ',
    '2023-02-29T23:59:59.999Z',
    '2024-04-31T23:59:59.999Z',
    '2024-02-29T24:00:00.000Z',
    '2024-02-29T23:59:60.000Z',
    1709251199999, null, undefined,
  ]) {
    assert.throws(() => project(invalid), /asOfAt must be a canonical UTC ISO timestamp/, String(invalid));
  }
});

test('leap-day snapshot cutoff includes the exact event but rejects earlier cutoffs', () => {
  assert.equal(project('2024-02-29T23:59:59.999Z').status, 'issued');
  assert.equal(project('2024-03-01T00:00:00.000Z').eventCount, 1);
  assert.throws(() => project('2024-02-29T23:59:59.998Z'),
    /after snapshot as-of timestamp/);
});
