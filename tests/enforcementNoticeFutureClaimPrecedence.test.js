import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence } from '../server/services/enforcementNoticeGate.js';

const base = Object.freeze({
  tenantId: 'tenant-a', trustId: 'trust-a', noteId: 'note-a',
  noticeId: 'notice-a', noticeVersionId: 'version-a',
  preparedEvidenceRef: 'preparation-receipt-a',
  evaluatedAt: '2026-11-17T12:00:00.000Z',
});

test('future claimed delivery cannot be hidden by missing delivery receipt or preparation time', () => {
  const result = assessEnforcementNoticeEvidence({
    ...base, deliveredAt: '2026-11-17T12:00:00.001Z',
  });
  assert.deepEqual(result, {status: 'incomplete', reason: 'delivery_after_evaluation'});
});

test('future claimed delivery takes precedence over absent receipt when preparation is valid', () => {
  const result = assessEnforcementNoticeEvidence({
    ...base, preparedAt: '2026-11-17T11:59:59.999Z',
    deliveredAt: '2026-11-17T12:00:00.001Z',
  });
  assert.deepEqual(result, {status: 'incomplete', reason: 'delivery_after_evaluation'});
});

test('future claimed delivery is rejected with a receipt but without preparation time', () => {
  const result = assessEnforcementNoticeEvidence({
    ...base, deliveryEvidenceRef: 'delivery-receipt-a',
    deliveredAt: '2026-11-17T12:00:00.001Z',
  });
  assert.deepEqual(result, {status: 'incomplete', reason: 'delivery_after_evaluation'});
});
