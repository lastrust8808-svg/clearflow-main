import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', noteId: 'note-a' };
const event = (type, index, overrides = {}) => ({
  ...scope, eventId: 'event-' + index, type, actorId: 'actor-a',
  occurredAt: '2026-10-' + String(index).padStart(2, '0') + 'T12:00:00.000Z',
  documentRef: type === 'presented' ? 'document-1' : 'document-' + index,
  evidenceRef: 'evidence-' + index,
  ...overrides,
});
const project = events => projectPrivateNoteLifecycle({ ...scope, events });

test('empty history is a draft, not an issued or funded note', () => {
  assert.deepEqual(project([]), { status: 'draft', eventCount: 0, lastEventId: null, lastEventAt: null });
});
test('issuance and evidenced presentment project document status only', () => {
  assert.deepEqual(project([event('issued', 1), event('presented', 2)]), {
    status: 'presented', eventCount: 2, lastEventId: 'event-2', lastEventAt: '2026-10-02T12:00:00.000Z',
  });
});
test('dispute and notice preparation remain draft-only workflow states', () => {
  assert.equal(project([event('issued', 1), event('presented', 2), event('disputed', 3), event('notice_prepared', 4)]).status, 'notice_prepared');
  assert.equal(project([event('issued', 1), event('presented', 2), event('notice_prepared', 3), event('disputed', 4)]).status, 'disputed');
});
test('cannot present before issuance or issue twice', () => {
  assert.throws(() => project([event('presented', 1)]), /Invalid.*transition/);
  assert.throws(() => project([event('issued', 1), event('issued', 2)]), /Invalid.*transition/);
});
test('does not infer paid, settled, default or delivery from arbitrary events', () => {
  for (const type of ['settled', 'paid', 'defaulted', 'notice_sent', 'transfer_executed']) {
    assert.throws(() => project([event('issued', 1), event(type, 2)]), /Invalid.*transition/);
  }
});
test('duplicate event IDs are rejected, including same ID with altered payload', () => {
  assert.throws(() => project([event('issued', 1), event('presented', 2, { eventId: 'event-1' })]), /Duplicate/);
});
test('cross-tenant, entity, trust or note events are rejected', () => {
  for (const key of Object.keys(scope)) {
    assert.throws(() => project([event('issued', 1, { [key]: 'other' })]), /scope mismatch/);
  }
});
test('evidence references required before projecting external events', () => {
  assert.throws(() => project([event('issued', 1, { documentRef: '' })]), /documentRef/);
  assert.throws(() => project([event('issued', 1), event('presented', 2, { evidenceRef: null })]), /evidenceRef/);
  assert.throws(() => project([event('issued', 1), event('presented', 2), event('notice_prepared', 3, { documentRef: undefined })]), /documentRef/);
});
test('presentment evidence is bound to the actual issued document version', () => {
  assert.equal(project([event('issued', 1), event('presented', 2)]).status, 'presented');
  assert.throws(() => project([event('issued', 1), event('presented', 2, { documentRef: 'another-note-document' })]), /must match the issued note/);
  assert.throws(() => project([event('issued', 1), event('presented', 2, { documentRef: undefined })]), /documentRef/);
});
test('notice drafts cannot masquerade as the issued instrument or reuse a draft version', () => {
  assert.throws(() => project([
    event('issued', 1), event('presented', 2),
    event('notice_prepared', 3, { documentRef: 'document-1' }),
  ]), /distinct and unique/);
  assert.throws(() => project([
    event('issued', 1), event('presented', 2), event('notice_prepared', 3),
    event('disputed', 4), event('notice_prepared', 5, { documentRef: 'document-3' }),
  ]), /distinct and unique/);
});
test('distinct notice revisions remain draft-only and require separate evidence for disputes', () => {
  const events = [
    event('issued', 1), event('presented', 2), event('notice_prepared', 3),
    event('disputed', 4), event('notice_prepared', 5),
  ];
  assert.equal(project(events).status, 'notice_prepared');
  assert.throws(() => project(events.map((entry, index) =>
    index === 3 ? { ...entry, evidenceRef: null } : entry)), /evidenceRef/);
});
test('rejects missing actor, malformed timestamps, out-of-order or tied events', () => {
  assert.throws(() => project([event('issued', 1, { actorId: ' ' })]), /actorId/);
  assert.throws(() => project([event('issued', 1, { occurredAt: '2026-02-30T12:00:00.000Z' })]), /timestamp/);
  assert.throws(() => project([event('issued', 2), event('presented', 1)]), /increasing/);
  assert.throws(() => project([event('issued', 1), event('presented', 2, { occurredAt: event('issued', 1).occurredAt })]), /increasing/);
});
test('rejects malformed snapshot, event list and identifiers', () => {
  assert.throws(() => projectPrivateNoteLifecycle(null), /snapshot/);
  assert.throws(() => projectPrivateNoteLifecycle({ ...scope, events: null }), /events/);
  assert.throws(() => projectPrivateNoteLifecycle({ ...scope, trustId: ' ', events: [] }), /trustId/);
  assert.throws(() => project([null]), /Invalid/);
});
test('does not mutate supplied events and freezes the projection', () => {
  const events = [event('issued', 1), event('presented', 2)];
  const original = structuredClone(events);
  const result = project(events);
  assert.deepEqual(events, original);
  assert.ok(Object.isFrozen(result));
  assert.equal(Object.hasOwn(result, 'paymentConfirmed'), false);
});
