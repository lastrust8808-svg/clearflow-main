import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence } from '../server/services/enforcementNoticeGate.js';

const packet = {
  tenantId: 'tenant-a', trustId: 'trust-a', noteId: 'note-a',
  noticeId: 'notice-a', noticeVersionId: 'version-a',
  preparedEvidenceRef: 'prepared-receipt-a',
  evaluatedAt: '2026-11-17T12:00:00.000Z',
};

test('delivery receipt alone cannot make a notice review-ready without preparation chronology', () => {
  const result = assessEnforcementNoticeEvidence({
    ...packet, deliveryEvidenceRef: 'delivery-receipt-a',
    deliveredAt: '2026-11-17T11:59:59.999Z',
  });
  assert.deepEqual(result, { status: 'incomplete', reason: 'preparation_timestamp_missing' });
});

test('delivery receipt without either timestamp cannot make a notice review-ready', () => {
  const result = assessEnforcementNoticeEvidence({
    ...packet, deliveryEvidenceRef: 'delivery-receipt-a',
  });
  assert.deepEqual(result, { status: 'incomplete', reason: 'preparation_timestamp_missing' });
});

test('a delivery timestamp without preparation or receipt cannot establish review readiness', () => {
  const result = assessEnforcementNoticeEvidence({
    ...packet, deliveredAt: '2026-11-17T11:59:59.999Z',
  });
  assert.deepEqual(result, { status: 'incomplete', reason: 'preparation_timestamp_missing' });
});
