import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

// Structural resource-limit regression only; no authenticated note issuance.
const scope = { tenantId: 'tenant-cap', entityId: 'entity-cap', trustId: 'trust-cap', noteId: 'note-cap' };
const issued = { ...scope, eventId: 'event-cap', actorId: 'actor-cap', type: 'issued',
  occurredAt: '2026-01-01T00:00:00.000Z', documentRef: 'document-cap', evidenceRef: 'evidence-cap' };
const project = events => projectPrivateNoteLifecycle({
  ...scope, asOfAt: '2026-01-02T00:00:00.000Z', events,
});

test('oversized private-note history rejects before evaluating a hostile indexed getter', () => {
  const events = new Array(10001);
  let getterCalls = 0;
  Object.defineProperty(events, '0', {
    enumerable: true, configurable: true,
    get() { getterCalls++; throw Error('hostile event getter executed'); },
  });
  assert.throws(() => project(events), /maximum event count/);
  assert.equal(getterCalls, 0);
});

test('maximum-length private-note history is validated rather than silently truncated', () => {
  const events = new Array(10000).fill(issued);
  // The second event repeats an ID. If only the first event were projected,
  // the returned state would misleadingly claim a valid issuance.
  assert.throws(() => project(events), /Duplicate private note event ID/);
  assert.equal(project([issued]).eventCount, 1);
});
