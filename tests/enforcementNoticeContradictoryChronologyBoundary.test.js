import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence as assess } from '../server/services/enforcementNoticeGate.js';
import { fingerprintEnforcementNoticeEvidence as fingerprint, matchesEnforcementNoticeEvidenceFingerprint as matches } from '../server/services/enforcementNoticeFingerprint.js';

const base = Object.freeze({
  tenantId: 'tenant-a', trustId: 'trust-a', noteId: 'note-a',
  noticeId: 'notice-a', noticeVersionId: 'version-a',
  preparedEvidenceRef: 'prepared-a',
  evaluatedAt: '2026-11-18T12:00:00.000Z'
});

test('delivery preceding preparation is rejected even without a delivery evidence reference', () => {
  const premature = {
    ...base, preparedAt: '2026-11-18T11:00:00.000Z',
    deliveredAt: '2026-11-18T10:59:59.999Z'
  };
  assert.deepEqual(assess(premature), { status: 'incomplete', reason: 'delivery_before_preparation' });
  const original = fingerprint(premature);
  assert.equal(original.reason, 'delivery_before_preparation');
  assert.equal(original.serviceVerified, false);
  const corrected = { ...premature, deliveredAt: premature.preparedAt };
  assert.equal(assess(corrected).reason, 'partial_delivery_evidence');
  assert.equal(matches(corrected, original.sha256), false);
});

test('future preparation takes precedence over an earlier contradictory delivery claim', () => {
  const contradictory = {
    ...base, preparedAt: '2026-11-18T12:00:00.001Z',
    deliveredAt: '2026-11-18T11:59:59.999Z',
    deliveryEvidenceRef: 'delivery-a'
  };
  assert.deepEqual(assess(contradictory), { status: 'incomplete', reason: 'preparation_after_evaluation' });
  const original = fingerprint(contradictory);
  assert.equal(original.reason, 'preparation_after_evaluation');
  assert.equal(original.serviceVerified, false);
  const corrected = { ...contradictory, preparedAt: '2026-11-18T11:59:59.998Z' };
  assert.equal(assess(corrected).reason, 'unverified_delivery_claim');
  assert.equal(matches(corrected, original.sha256), false);
});
