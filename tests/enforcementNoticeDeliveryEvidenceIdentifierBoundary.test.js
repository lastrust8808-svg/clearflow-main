import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence } from '../server/services/enforcementNoticeGate.js';

const packet = () => ({
  tenantId: 'tenant-a', trustId: 'trust-a', noteId: 'note-a',
  noticeId: 'notice-a', noticeVersionId: 'version-a',
  preparedEvidenceRef: 'prepared-a',
  preparedAt: '2026-11-20T12:00:00.000Z',
  deliveredAt: '2026-11-20T12:01:00.000Z',
  deliveryEvidenceRef: 'delivery-a',
  evaluatedAt: '2026-11-20T12:02:00.000Z',
});

test('delivery evidence reference accepts exactly 128 ASCII identifier characters', () => {
  const result = assessEnforcementNoticeEvidence({
    ...packet(), deliveryEvidenceRef: 'd'.repeat(128),
  });
  assert.equal(result.status, 'evidence_ready_for_review');
  assert.equal(result.reason, 'unverified_delivery_claim');
});

test('oversized or malformed delivery evidence reference fails closed', () => {
  for (const invalid of ['d'.repeat(129), ' delivery-a', 'delivery-a ',
    'delivery/a', 'delivery\\nref', '', 42, Symbol('delivery')]) {
    assert.throws(() => assessEnforcementNoticeEvidence({
      ...packet(), deliveryEvidenceRef: invalid,
    }), /Invalid or reused delivery evidence reference/);
  }
});

test('delivery evidence cannot impersonate any notice or preparation identity', () => {
  const original = packet();
  for (const field of ['tenantId', 'trustId', 'noteId', 'noticeId',
    'noticeVersionId', 'preparedEvidenceRef']) {
    assert.throws(() => assessEnforcementNoticeEvidence({
      ...original, deliveryEvidenceRef: original[field],
    }), /Invalid or reused delivery evidence reference/);
  }
});
