import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivateNoteLifecycle } from '../server/services/privateNoteLifecycle.js';

const scope = {
  tenantId: 'tenant-private', entityId: 'entity-private',
  trustId: 'trust-private', noteId: 'note-private',
};
const issued = {
  ...scope, eventId: 'event-issued', actorId: 'trustee-private',
  type: 'issued', occurredAt: '2026-11-01T12:00:00.000Z',
  documentRef: 'signed-note-pdf', evidenceRef: 'issuance-evidence',
};
const project = events => projectPrivateNoteLifecycle({
  ...scope, asOfAt: '2026-11-10T00:00:00.000Z', events,
});

test('draft notice never projects delivery, default, payment, or settlement', () => {
  const presented = {
    ...issued, eventId: 'event-presented', type: 'presented',
    occurredAt: '2026-11-02T12:00:00.000Z',
    evidenceRef: 'presentment-evidence',
  };
  const notice = {
    ...issued, eventId: 'event-notice', type: 'notice_prepared',
    occurredAt: '2026-11-03T12:00:00.000Z',
    documentRef: 'notice-draft-pdf', evidenceRef: 'notice-preparation-evidence',
  };
  const result = project([issued, presented, notice]);
  assert.equal(result.status, 'notice_prepared');
  for (const key of ['delivered', 'served', 'defaulted', 'settled', 'paid', 'balance']) {
    assert.equal(Object.hasOwn(result, key), false, key);
  }
  assert.equal(Object.isFrozen(result), true);
});

test('legal or financial claims cannot be smuggled into lifecycle event metadata', () => {
  for (const field of ['delivered', 'served', 'defaulted', 'settled', 'paid', 'balance', 'paymentId']) {
    assert.throws(() => project([{ ...issued, [field]: true }]),
      /Unsupported private note lifecycle event field/, field);
  }
});

test('unreviewed legal states cannot be projected as lifecycle transitions', () => {
  for (const type of ['delivered', 'served', 'defaulted', 'settled', 'paid', 'enforced']) {
    assert.throws(() => project([{ ...issued, type }]),
      /Invalid private note lifecycle transition/, type);
  }
});
