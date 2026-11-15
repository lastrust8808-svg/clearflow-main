import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = { tenantId: 'tenant-descriptor', entityId: 'entity-descriptor', trustId: 'trust-descriptor', noteId: 'note-descriptor' };
const event = (type, n) => ({
  ...scope, eventId: 'event-' + n, type,
  occurredAt: '2026-10-0' + n + 'T12:00:00.000Z',
  actorId: 'actor-descriptor',
  documentRef: n === 2 ? 'document-1' : 'document-' + n,
  evidenceRef: 'evidence-' + n,
});
const project = events => projectPrivateNoteLifecycle({ ...scope, asOfAt: '2026-11-01T00:00:00.000Z', events });

for (const field of ['documentRef', 'evidenceRef', 'actorId', 'occurredAt']) {
  test('rejects accessor-backed ' + field + ' without invoking getter', () => {
    const issued = event('issued', 1);
    let reads = 0;
    Object.defineProperty(issued, field, {
      enumerable: true,
      get() { reads++; throw new Error('untrusted getter executed'); },
    });
    assert.throws(() => project([issued]), /enumerable data properties/);
    assert.equal(reads, 0);
  });
}

test('valid plain-data issuance and presentment remain accepted', () => {
  assert.equal(project([event('issued', 1), event('presented', 2)]).status, 'presented');
});
