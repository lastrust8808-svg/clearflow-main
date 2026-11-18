import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence } from '../server/services/enforcementNoticeGate.js';

const base = {
  tenantId: 'tenant', trustId: 'trust', noteId: 'note',
  noticeId: 'notice', noticeVersionId: 'version',
  preparedEvidenceRef: 'prepared-receipt',
  preparedAt: '2026-11-17T12:00:00.000Z',
  evaluatedAt: '2026-11-17T12:00:00.002Z',
};

test('enforcement review rejects future delivery even when the delivery receipt is missing', () => {
  const result = assessEnforcementNoticeEvidence({
    ...base, deliveredAt: '2026-11-17T12:00:00.003Z',
  });
  assert.deepEqual(result, {
    status: 'incomplete', reason: 'delivery_after_evaluation',
  });
});

test('enforcement review rejects delivery before preparation even without a receipt', () => {
  const result = assessEnforcementNoticeEvidence({
    ...base, deliveredAt: '2026-11-17T11:59:59.999Z',
  });
  assert.deepEqual(result, {
    status: 'incomplete', reason: 'delivery_before_preparation',
  });
});

test('enforcement review does not treat exact evaluation-time delivery as verified service', () => {
  const result = assessEnforcementNoticeEvidence({
    ...base, deliveryEvidenceRef: 'delivery-receipt',
    deliveredAt: base.evaluatedAt,
  });
  assert.deepEqual(result, {
    status: 'evidence_ready_for_review', reason: 'unverified_delivery_claim',
  });
  assert.equal(Object.isFrozen(result), true);
});

test('future preparation takes precedence over contradictory early delivery', () => {
  const result = assessEnforcementNoticeEvidence({
    ...base,
    preparedAt: '2026-11-17T12:00:00.004Z',
    deliveredAt: '2026-11-17T12:00:00.001Z',
    deliveryEvidenceRef: 'delivery-receipt',
  });
  assert.deepEqual(result, {
    status: 'incomplete', reason: 'preparation_after_evaluation',
  });
});

test('future preparation is rejected without any delivery evidence', () => {
  const result = assessEnforcementNoticeEvidence({
    ...base, preparedAt: '2026-11-17T12:00:00.003Z',
  });
  assert.deepEqual(result, {
    status: 'incomplete', reason: 'preparation_after_evaluation',
  });
});

test('future delivery is rejected even when preparation timestamp is omitted', () => {
  const { preparedAt, ...withoutPreparation } = base;
  const result = assessEnforcementNoticeEvidence({
    ...withoutPreparation,
    deliveryEvidenceRef: 'delivery-receipt',
    deliveredAt: '2026-11-17T12:00:00.003Z',
  });
  assert.deepEqual(result, {
    status: 'incomplete', reason: 'delivery_after_evaluation',
  });
});

test('missing preparation timestamp prevents ready status at exact delivery boundary', () => {
  const { preparedAt, ...withoutPreparation } = base;
  const result = assessEnforcementNoticeEvidence({
    ...withoutPreparation,
    deliveryEvidenceRef: 'delivery-receipt',
    deliveredAt: base.evaluatedAt,
  });
  assert.deepEqual(result, {
    status: 'incomplete', reason: 'preparation_timestamp_missing',
  });
});
