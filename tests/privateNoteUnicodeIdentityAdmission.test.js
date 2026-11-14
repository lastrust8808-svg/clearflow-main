import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

// Pure identity-admission tests. No authenticated issuance, signatures, or service.
const scope = Object.freeze({
  tenantId: 'tenant-unicode', entityId: 'entity-unicode',
  trustId: 'trust-unicode', noteId: 'note-unicode',
});
const issued = Object.freeze({
  ...scope, eventId: 'event-unicode', actorId: 'actor-unicode',
  type: 'issued', occurredAt: '2026-01-01T00:00:00.000Z',
  documentRef: 'document-unicode', evidenceRef: 'evidence-unicode',
});
const project = (event) => projectPrivateNoteLifecycle({
  ...scope, asOfAt: '2026-01-02T00:00:00.000Z', events: [event],
});

test('private-note identity fields reject canonically equivalent but non-NFC spellings', () => {
  for (const field of ['eventId', 'actorId', 'documentRef', 'evidenceRef']) {
    assert.throws(
      () => project({ ...issued, [field]: 'Cafe\u0301' }),
      /NFC-normalized/,
      field,
    );
  }
});

test('private-note identities reject invisible format characters and unpaired surrogates', () => {
  for (const invalid of ['actor\u200dhidden', 'actor\ud800', 'actor\ufdd0']) {
    assert.throws(() => project({ ...issued, actorId: invalid }), TypeError);
  }
});

test('private-note event identity validation does not coerce hostile objects', () => {
  let coerced = 0;
  const hostile = { toString() { coerced++; throw Error('coercion executed'); } };
  assert.throws(() => project({ ...issued, eventId: hostile }), /nonempty unpadded string/);
  assert.equal(coerced, 0);
});

test('valid NFC supplementary Unicode identity remains supported', () => {
  const result = project({ ...issued, actorId: 'actor-\ud83c\udf3f' });
  assert.equal(result.status, 'issued');
  assert.equal(result.eventCount, 1);
});
