import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', noteId: 'note-a' };
const event = (type, index, overrides = {}) => ({
  ...scope, eventId: 'event-' + index, type, actorId: 'actor-a',
  occurredAt: '2026-10-' + String(index).padStart(2, '0') + 'T12:00:00.000Z',
  documentRef: type === 'presented' || type === 'disputed' ? 'document-1' : 'document-' + index,
  evidenceRef: 'evidence-' + index,
  ...overrides,
});
const project = events => projectPrivateNoteLifecycle({ ...scope, asOfAt: '2026-11-01T00:00:00.000Z', events });

test('empty history is a draft, not an issued or funded note', () => {
  assert.deepEqual(project([]), { status: 'draft', eventCount: 0, lastEventId: null, lastEventAt: null });
});
test('issuance and evidenced presentment project document status only', () => {
  assert.deepEqual(project([event('issued', 1), event('presented', 2)]), {
    status: 'presented', eventCount: 2, lastEventId: 'event-2', lastEventAt: '2026-10-02T12:00:00.000Z',
  });
});
test('issuance requires a nonempty provenance reference, not just a document identifier', () => {
  for (const missing of [undefined, null, '', ' ', ' evidence-with-padding ']) {
    assert.throws(() => project([event('issued', 1, { evidenceRef: missing })]), /evidenceRef/);
  }
  assert.equal(project([event('issued', 1, { evidenceRef: 'authority-and-signature-record' })]).status, 'issued');
});
test('a later presentment cannot make an unevidenced issuance valid', () => {
  assert.throws(() => project([
    event('issued', 1, { evidenceRef: null }), event('presented', 2),
  ]), /evidenceRef/);
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
test('presentment must have its own evidence distinct from issuance provenance', () => {
  assert.throws(() => project([
    event('issued', 1, { evidenceRef: 'shared-evidence-record' }),
    event('presented', 2, { evidenceRef: 'shared-evidence-record' }),
  ]), /Presentment evidence must be distinct from issuance evidence/);
  assert.equal(project([
    event('issued', 1, { evidenceRef: 'signed-issuance-record' }),
    event('presented', 2, { evidenceRef: 'independent-presentment-record' }),
  ]).status, 'presented');
});

test('dispute evidence cannot replay issuance or presentment provenance', () => {
  const issued = event('issued', 1);
  const presented = event('presented', 2);
  for (const replayedRef of [issued.evidenceRef, presented.evidenceRef]) {
    assert.throws(() => project([
      issued, presented, event('disputed', 3, { evidenceRef: replayedRef }),
    ]), /lifecycle evidence reference must be unique across events/);
  }
  assert.equal(project([issued, presented, event('disputed', 3)]).status, 'disputed');
});

test('dispute must bind to an already registered note document, not an unrelated reference', () => {
  const history = [event('issued', 1), event('presented', 2)];
  for (const invalid of [undefined, null, '', 'document-2', 'document-unknown', 'document-5']) {
    assert.throws(() => project([
      ...history, event('disputed', 3, { documentRef: invalid }),
    ]), /documentRef|Dispute must reference/);
  }
  assert.equal(project([...history, event('disputed', 3, { documentRef: 'document-1' })]).status, 'disputed');
});

test('disputes may target existing notice drafts but not future or unrelated notice documents', () => {
  const history = [event('issued', 1), event('presented', 2), event('notice_prepared', 3)];
  assert.equal(project([...history, event('disputed', 4, { documentRef: 'document-3' })]).status, 'disputed');
  for (const invalid of ['document-4', 'document-5', 'other-note-notice']) {
    assert.throws(() => project([
      ...history, event('disputed', 4, { documentRef: invalid }),
    ]), /Dispute must reference/);
  }
  const revised = [...history, event('disputed', 4, { documentRef: 'document-3' }),
    event('notice_prepared', 5, { supersedesDocumentRef: 'document-3' })];
  assert.equal(project([...revised, event('disputed', 6, { documentRef: 'document-3' })]).status, 'disputed');
});

test('notice preparation cannot reuse issuance or presentment evidence', () => {
  const issued = event('issued', 1);
  const presented = event('presented', 2);
  for (const replayedRef of [issued.evidenceRef, presented.evidenceRef]) {
    assert.throws(() => project([
      issued, presented, event('notice_prepared', 3, { evidenceRef: replayedRef }),
    ]), /lifecycle evidence reference must be unique across events/);
  }
  assert.equal(project([issued, presented, event('notice_prepared', 3)]).status, 'notice_prepared');
});

test('later disputes require fresh evidence even when the notice is revised', () => {
  const history = [
    event('issued', 1), event('presented', 2), event('disputed', 3),
    event('notice_prepared', 4),
  ];
  assert.throws(() => project([
    ...history, event('disputed', 5, { evidenceRef: 'evidence-3' }),
  ]), /lifecycle evidence reference must be unique across events/);
  assert.equal(project([...history, event('disputed', 5)]).status, 'disputed');
});

test('notice drafts cannot masquerade as the issued instrument or reuse a draft version', () => {
  assert.throws(() => project([
    event('issued', 1), event('presented', 2),
    event('notice_prepared', 3, { documentRef: 'document-1' }),
  ]), /distinct and unique/);
  assert.throws(() => project([
    event('issued', 1), event('presented', 2), event('notice_prepared', 3),
    event('disputed', 4), event('notice_prepared', 5, { documentRef: 'document-3', supersedesDocumentRef: 'document-3' }),
  ]), /distinct and unique/);
});
test('prepared notice drafts require a provenance reference without claiming delivery', () => {
  const issued = event('issued', 1);
  const presented = event('presented', 2);
  for (const missing of [undefined, null, '', ' ', ' padded-evidence ']) {
    assert.throws(() => project([
      issued, presented, event('notice_prepared', 3, { evidenceRef: missing }),
    ]), /evidenceRef/);
  }
  assert.equal(project([issued, presented, event('notice_prepared', 3)]).status, 'notice_prepared');
});

test('later revised notice drafts also require their own preparation evidence', () => {
  const history = [
    event('issued', 1), event('presented', 2),
    event('notice_prepared', 3), event('disputed', 4),
  ];
  assert.throws(() => project([
    ...history, event('notice_prepared', 5, { evidenceRef: undefined, supersedesDocumentRef: 'document-3' }),
  ]), /evidenceRef/);
  assert.equal(project([...history, event('notice_prepared', 5, { supersedesDocumentRef: 'document-3' })]).status, 'notice_prepared');
});

test('revised notice versions cannot reuse an earlier draft preparation evidence reference', () => {
  const history = [
    event('issued', 1), event('presented', 2),
    event('notice_prepared', 3), event('disputed', 4),
  ];
  assert.throws(() => project([
    ...history, event('notice_prepared', 5, { evidenceRef: 'evidence-3', supersedesDocumentRef: 'document-3' }),
  ]), /preparation evidence reference must be unique/);
  // A distinct immutable document reference and separate evidence reference
  // are both required; neither alone establishes authenticity or delivery.
  assert.equal(project([...history, event('notice_prepared', 5, { supersedesDocumentRef: 'document-3' })]).status, 'notice_prepared');
});

test('distinct notice revisions remain draft-only and require separate evidence for disputes', () => {
  const events = [
    event('issued', 1), event('presented', 2), event('notice_prepared', 3),
    event('disputed', 4), event('notice_prepared', 5, { supersedesDocumentRef: 'document-3' }),
  ];
  assert.equal(project(events).status, 'notice_prepared');
  assert.throws(() => project(events.map((entry, index) =>
    index === 3 ? { ...entry, evidenceRef: null } : entry)), /evidenceRef/);
});
test('rejects future-dated note events rather than projecting a later lifecycle state', () => {
  const issued = event('issued', 1);
  const presented = event('presented', 2);
  assert.throws(() => projectPrivateNoteLifecycle({
    ...scope, asOfAt: '2026-10-01T11:59:59.999Z', events: [issued],
  }), /after snapshot as-of timestamp/);
  assert.equal(projectPrivateNoteLifecycle({
    ...scope, asOfAt: issued.occurredAt, events: [issued],
  }).status, 'issued');
  assert.throws(() => projectPrivateNoteLifecycle({
    ...scope, asOfAt: issued.occurredAt, events: [issued, presented],
  }), /after snapshot as-of timestamp/);
});

test('requires a canonical snapshot as-of time even for an empty note history', () => {
  for (const invalid of [undefined, null, '', '2026-11-01', '2026-11-01T00:00:00Z',
    '2026-11-01T00:00:00.000+00:00', '2026-02-30T00:00:00.000Z']) {
    assert.throws(() => projectPrivateNoteLifecycle({
      ...scope, asOfAt: invalid, events: [],
    }), /asOfAt/);
  }
  assert.deepEqual(project([]), {
    status: 'draft', eventCount: 0, lastEventId: null, lastEventAt: null,
  });
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

test('rejects control characters in tenant, entity, trust and note identifiers', () => {
  for (const key of Object.keys(scope)) {
    for (const control of ['\u0000', '\u001f', '\u007f', '\u009f']) {
      assert.throws(() => projectPrivateNoteLifecycle({
        ...scope, [key]: scope[key] + control, events: [],
      }), /control characters/);
    }
  }
});

test('rejects control characters in lifecycle event, actor, document and evidence references', () => {
  for (const key of ['eventId', 'actorId', 'documentRef', 'evidenceRef']) {
    for (const control of ['\u0000', '\u001f', '\u007f', '\u009f']) {
      assert.throws(() => project([event('issued', 1, {
        [key]: 'identifier' + control,
      })]), /control characters/);
    }
  }
  assert.equal(project([event('issued', 1), event('presented', 2)]).status, 'presented');
});

test('revised notices must identify the immediate preceding draft, not merely any earlier notice', () => {
  const history = [
    event('issued', 1), event('presented', 2),
    event('notice_prepared', 3), event('disputed', 4),
  ];
  for (const invalid of [undefined, null, '', 'document-1', 'document-2', 'document-unknown',
    ' document-3 ', 'document-3\\u0000']) {
    assert.throws(() => project([
      ...history, event('notice_prepared', 5, { supersedesDocumentRef: invalid }),
    ]), /supersedesDocumentRef|must supersede the latest prepared draft/);
  }
  const revised = [...history, event('notice_prepared', 5, { supersedesDocumentRef: 'document-3' })];
  assert.equal(project(revised).status, 'notice_prepared');
  assert.throws(() => project([
    ...revised, event('disputed', 6),
    event('notice_prepared', 7, { supersedesDocumentRef: 'document-3' }),
  ]), /must supersede the latest prepared draft/);
  assert.equal(project([
    ...revised, event('disputed', 6),
    event('notice_prepared', 7, { supersedesDocumentRef: 'document-5' }),
  ]).status, 'notice_prepared');
});

test('initial notice draft cannot falsely claim a predecessor', () => {
  const history = [event('issued', 1), event('presented', 2)];
  for (const invalid of ['document-1', 'document-unknown', '']) {
    assert.throws(() => project([
      ...history, event('notice_prepared', 3, { supersedesDocumentRef: invalid }),
    ]), /Initial notice draft cannot supersede/);
  }
  assert.equal(project([...history, event('notice_prepared', 3)]).status, 'notice_prepared');
});


test('issued instrument and notice documents cannot masquerade as lifecycle evidence', () => {
  assert.throws(() => project([
    event('issued', 1, { evidenceRef: 'document-1' }),
  ]), /document and lifecycle evidence references must be distinct/);
  assert.throws(() => project([
    event('issued', 1), event('presented', 2),
    event('notice_prepared', 3, { evidenceRef: 'document-1' }),
  ]), /document and lifecycle evidence references must be distinct/);
  assert.throws(() => project([
    event('issued', 1), event('presented', 2),
    event('notice_prepared', 3), event('disputed', 4, { evidenceRef: 'document-3' }),
  ]), /document and lifecycle evidence references must be distinct/);
});

test('future notice document IDs cannot recycle earlier action evidence references', () => {
  assert.throws(() => project([
    event('issued', 1),
    event('presented', 2, { evidenceRef: 'document-3' }),
    event('notice_prepared', 3),
  ]), /document and lifecycle evidence references must be distinct/);
  assert.equal(project([
    event('issued', 1), event('presented', 2),
    event('notice_prepared', 3), event('disputed', 4),
  ]).status, 'disputed');
});

test('journal event IDs cannot double as issuance or presentment evidence receipts', () => {
  assert.throws(() => project([
    event('issued', 1, { eventId: 'evidence-1' }),
  ]), /event, document and evidence references must be distinct/);
  assert.throws(() => project([
    event('issued', 1, { evidenceRef: 'event-2' }),
    event('presented', 2),
  ]), /event, document and evidence references must be distinct/);
  assert.equal(project([event('issued', 1), event('presented', 2)]).status, 'presented');
});

test('journal event IDs cannot alias issued or future notice document versions', () => {
  assert.throws(() => project([
    event('issued', 1, { eventId: 'document-1' }),
  ]), /event, document and evidence references must be distinct/);
  assert.throws(() => project([
    event('issued', 1), event('presented', 2, { eventId: 'document-3' }),
    event('notice_prepared', 3),
  ]), /event, document and evidence references must be distinct/);
  assert.equal(project([
    event('issued', 1), event('presented', 2), event('notice_prepared', 3),
  ]).status, 'notice_prepared');
});

test('actor identities cannot masquerade as journal events or independent evidence', () => {
  assert.throws(() => project([
    event('issued', 1, { actorId: 'event-1' }),
  ]), /actor identifiers must be distinct/);
  assert.throws(() => project([
    event('issued', 1, { actorId: 'evidence-2' }),
    event('presented', 2),
  ]), /actor identifiers must be distinct/);
  assert.throws(() => project([
    event('issued', 1, { evidenceRef: 'actor-a' }),
  ]), /actor identifiers must be distinct/);
  assert.equal(project([
    event('issued', 1), event('presented', 2),
  ]).status, 'presented');
});

test('actor identities cannot alias issued or later notice documents', () => {
  assert.throws(() => project([
    event('issued', 1, { actorId: 'document-1' }),
  ]), /actor identifiers must be distinct/);
  assert.throws(() => project([
    event('issued', 1, { actorId: 'document-3' }),
    event('presented', 2),
    event('notice_prepared', 3),
  ]), /actor identifiers must be distinct/);
  // Multiple actions by the same principal remain valid when the identifier
  // does not overlap the document, journal-event, or evidence namespaces.
  assert.equal(project([
    event('issued', 1), event('presented', 2),
    event('notice_prepared', 3),
  ]).status, 'notice_prepared');
});


test('rejects unsupported legal or financial assertions in document-only lifecycle events', () => {
  for (const [type, index, field, value] of [
    ['issued', 1, 'fundedAt', '2026-10-01T12:00:00.000Z'],
    ['presented', 2, 'deliveredAt', '2026-10-02T12:00:00.000Z'],
    ['disputed', 3, 'defaultedAt', '2026-10-03T12:00:00.000Z'],
    ['notice_prepared', 4, 'servedAt', '2026-10-04T12:00:00.000Z'],
    ['notice_prepared', 4, 'paymentReceivedMinor', 100_00],
  ]) {
    const history = [event('issued', 1), event('presented', 2), event('disputed', 3),
      event('notice_prepared', 4)];
    const modified = history.slice(0, index);
    modified[index - 1] = event(type, index, { [field]: value });
    assert.throws(() => project(modified), /Unsupported private note lifecycle event field/);
  }
  // A predecessor is meaningful only for an actual revised notice draft.
  assert.throws(() => project([
    event('issued', 1, { supersedesDocumentRef: 'unrelated' }),
  ]), /Unsupported private note lifecycle event field/);
  assert.equal(project([
    event('issued', 1), event('presented', 2), event('notice_prepared', 3),
    event('disputed', 4), event('notice_prepared', 5, { supersedesDocumentRef: 'document-3' }),
  ]).status, 'notice_prepared');
});

test('hidden and symbol-bearing lifecycle event claims fail closed', () => {
  const hidden = event('issued', 1);
  Object.defineProperty(hidden, 'settled', { value: true, enumerable: false });
  assert.throws(() => project([hidden]), /enumerable data properties/);
  const symbolic = event('issued', 1);
  symbolic[Symbol('deliveryProof')] = 'unverified';
  assert.throws(() => project([symbolic]), /Unsupported private note lifecycle event field/);
});

test('private-note lifecycle events reject inherited or missing-own identity claims', () => {
  const inherited = Object.assign(Object.create({ paidAt: '2026-10-01T12:00:00.000Z' }), event('issued', 1));
  assert.throws(() => project([inherited]), /plain data record/);
  const missingActor = event('issued', 1);
  delete missingActor.actorId;
  assert.throws(() => project([missingActor]), /Missing own.*actorId/);
  const missingEvidence = event('issued', 1);
  delete missingEvidence.evidenceRef;
  assert.throws(() => project([missingEvidence]), /Missing own.*evidenceRef/);
  const nullPrototypeRecord = Object.assign(Object.create(null), event('issued', 1));
  assert.equal(project([nullPrototypeRecord]).status, 'issued');
});

test('private-note event admission rejects accessor and non-enumerable fields without invoking getters', () => {
  const accessor = event('issued', 1);
  let getterCalls = 0;
  Object.defineProperty(accessor, 'type', {
    enumerable: true,
    get() { getterCalls++; return 'issued'; },
  });
  assert.throws(() => project([accessor]), /enumerable data properties/);
  assert.equal(getterCalls, 0);
  const hidden = event('issued', 1);
  Object.defineProperty(hidden, 'evidenceRef', {
    enumerable: false, value: 'evidence-1',
  });
  assert.throws(() => project([hidden]), /enumerable data properties/);
  const hiddenPredecessor = event('notice_prepared', 3, { supersedesDocumentRef: 'document-2' });
  Object.defineProperty(hiddenPredecessor, 'supersedesDocumentRef', {
    enumerable: false, value: 'document-2',
  });
  assert.throws(() => project([event('issued', 1), event('presented', 2), hiddenPredecessor]), /enumerable data properties/);
});

test('snapshot metadata rejects inherited, unreviewed, hidden and symbol-keyed claims', () => {
  const base = { ...scope, asOfAt: '2026-11-01T00:00:00.000Z', events: [event('issued', 1)] };
  const inherited = Object.assign(Object.create({ paymentConfirmed: true }), base);
  assert.throws(() => projectPrivateNoteLifecycle(inherited), /snapshot must be a plain data record/);
  assert.throws(() => projectPrivateNoteLifecycle({ ...base, fundedMinor: 50000 }), /Unsupported private note snapshot field/);
  const hidden = { ...base };
  Object.defineProperty(hidden, 'defaulted', { value: true, enumerable: false });
  assert.throws(() => projectPrivateNoteLifecycle(hidden), /snapshot fields must be enumerable data properties/);
  const symbolic = { ...base, [Symbol('paymentProof')]: 'unverified' };
  assert.throws(() => projectPrivateNoteLifecycle(symbolic), /Unsupported private note snapshot field/);
  assert.equal(projectPrivateNoteLifecycle(Object.assign(Object.create(null), base)).status, 'issued');
});

test('snapshot accessor claims are rejected without invoking their getters', () => {
  const base = { ...scope, asOfAt: '2026-11-01T00:00:00.000Z', events: [event('issued', 1)] };
  let getterCalls = 0;
  Object.defineProperty(base, 'tenantId', {
    enumerable: true,
    get() { getterCalls++; return scope.tenantId; },
  });
  assert.throws(() => projectPrivateNoteLifecycle(base), /snapshot fields must be enumerable data properties/);
  assert.equal(getterCalls, 0);
});

test('private-note history rejects sparse arrays and custom array prototypes', () => {
  const sparse = [event('issued', 1), , event('presented', 2)];
  assert.throws(() => project(sparse), /events must not contain holes/);
  const inherited = [event('issued', 1)];
  Object.setPrototypeOf(inherited, Object.create(Array.prototype));
  assert.throws(() => project(inherited), /events must be a plain array/);
  assert.equal(project(Object.freeze([event('issued', 1)])).status, 'issued');
  assert.equal(project([]).status, 'draft');
});

test('private-note history rejects accessor elements and hidden or symbol metadata', () => {
  const accessor = [event('issued', 1)];
  let getterCalls = 0;
  Object.defineProperty(accessor, '0', {
    enumerable: true, configurable: true,
    get() { getterCalls++; return event('issued', 1); },
  });
  assert.throws(() => project(accessor), /events must contain enumerable data elements/);
  assert.equal(getterCalls, 0);
  const hidden = [event('issued', 1)];
  Object.defineProperty(hidden, 'paymentReceived', { value: true, enumerable: false });
  assert.throws(() => project(hidden), /events must contain only array indices/);
  const symbolic = [event('issued', 1)];
  symbolic[Symbol('verified')] = true;
  assert.throws(() => project(symbolic), /events must contain only array indices/);
  const extra = [event('issued', 1)];
  extra.extra = 'unreviewed';
  assert.throws(() => project(extra), /events must contain only array indices/);
});
