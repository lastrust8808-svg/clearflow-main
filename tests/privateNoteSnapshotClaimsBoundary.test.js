import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = {
  tenantId: 'tenant-boundary', entityId: 'entity-boundary',
  trustId: 'trust-boundary', noteId: 'note-boundary',
};
const issued = {
  ...scope, eventId: 'event-issued', actorId: 'actor-trustee',
  type: 'issued', occurredAt: '2026-11-01T12:00:00.000Z',
  documentRef: 'document-issued', evidenceRef: 'evidence-issued',
};
const snapshot = events => ({
  ...scope, asOfAt: '2026-11-02T00:00:00.000Z', events,
});

test('snapshot cannot assert service, default, settlement, or payment outside the journal', () => {
  for (const key of ['served', 'delivered', 'defaulted', 'settled', 'paid', 'balance', 'paymentId', 'legalStatus']) {
    assert.throws(
      () => projectPrivateNoteLifecycle({ ...snapshot([issued]), [key]: true }),
      /Unsupported private note snapshot field/,
      key,
    );
  }
});

test('missing event provenance is rejected instead of projecting an issued note', () => {
  for (const key of ['eventId', 'actorId', 'documentRef', 'evidenceRef', 'occurredAt', 'type']) {
    const event = { ...issued };
    delete event[key];
    assert.throws(
      () => projectPrivateNoteLifecycle(snapshot([event])),
      /Missing own private note lifecycle event field/,
      key,
    );
  }
});

test('snapshot and event getters cannot fabricate authenticated scope or provenance', () => {
  const forgedSnapshot = snapshot([issued]);
  Object.defineProperty(forgedSnapshot, 'tenantId', {
    enumerable: true, get() { throw Error('getter executed'); },
  });
  assert.throws(
    () => projectPrivateNoteLifecycle(forgedSnapshot),
    /Private note snapshot fields must be enumerable data properties/,
  );
  const forgedEvent = { ...issued };
  Object.defineProperty(forgedEvent, 'evidenceRef', {
    enumerable: true, get() { throw Error('getter executed'); },
  });
  assert.throws(
    () => projectPrivateNoteLifecycle(snapshot([forgedEvent])),
    /Private note lifecycle event fields must be enumerable data properties/,
  );
});
