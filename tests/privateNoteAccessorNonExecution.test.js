import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = { tenantId: 'tenant-accessor', entityId: 'entity-accessor', trustId: 'trust-accessor', noteId: 'note-accessor' };
const base = (type, index) => ({ ...scope, eventId: 'event-' + index, type,
  occurredAt: '2026-10-0' + index + 'T12:00:00.000Z', actorId: 'actor-accessor',
  documentRef: index === 2 ? 'document-1' : 'document-' + index,
  evidenceRef: 'evidence-' + index });
const project = events => projectPrivateNoteLifecycle({ ...scope, asOfAt: '2026-11-01T00:00:00.000Z', events });

test('event type accessor is rejected without executing its getter', () => {
  const issued = base('issued', 1);
  let reads = 0;
  Object.defineProperty(issued, 'type', { enumerable: true, get() { reads++; throw Error('executed'); } });
  assert.throws(() => project([issued]), /enumerable data properties/);
  assert.equal(reads, 0);
});

test('notice predecessor accessor is rejected without executing its getter', () => {
  const notice = base('notice_prepared', 3);
  let reads = 0;
  Object.defineProperty(notice, 'supersedesDocumentRef', {
    enumerable: true, get() { reads++; throw Error('executed'); },
  });
  assert.throws(() => project([base('issued', 1), base('presented', 2), notice]), /enumerable data properties/);
  assert.equal(reads, 0);
});

test('ordinary issuance and notice preparation remain admitted', () => {
  assert.equal(project([base('issued', 1), base('presented', 2), base('notice_prepared', 3)]).status, 'notice_prepared');
});
