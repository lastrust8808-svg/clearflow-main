import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = Object.freeze({
  tenantId: 'tenant-frozen-history', entityId: 'entity-frozen-history',
  trustId: 'trust-frozen-history', noteId: 'note-frozen-history',
});
const issuance = Object.freeze({
  ...scope, eventId: 'event-frozen-issuance', actorId: 'actor-frozen',
  type: 'issued', occurredAt: '2026-01-01T00:00:00.000Z',
  documentRef: 'document-frozen', evidenceRef: 'evidence-frozen',
});
const snapshot = (events) => Object.freeze({
  ...scope, asOfAt: '2026-01-02T00:00:00.000Z', events,
});

test('deeply frozen valid private-note snapshot projects without mutating inputs', () => {
  const events = Object.freeze([issuance]);
  const before = JSON.stringify(snapshot(events));
  const result = projectPrivateNoteLifecycle(snapshot(events));
  assert.deepEqual(result, {
    status: 'issued', eventCount: 1,
    lastEventId: issuance.eventId, lastEventAt: issuance.occurredAt,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(JSON.stringify(snapshot(events)), before);
});

test('sealed dense event history remains admissible', () => {
  const events = Object.seal([{ ...issuance }]);
  const result = projectPrivateNoteLifecycle(snapshot(events));
  assert.equal(result.status, 'issued');
  assert.equal(result.eventCount, 1);
});

test('frozen sparse event history still fails closed', () => {
  const events = new Array(1);
  Object.freeze(events);
  assert.throws(() => projectPrivateNoteLifecycle(snapshot(events)), /holes/);
});
