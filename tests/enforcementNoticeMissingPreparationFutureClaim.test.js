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

test('future delivery timestamp cannot be hidden by missing preparation timestamp or delivery reference', () => {
  const future = { ...base, deliveredAt: '2026-11-18T12:00:00.001Z' };
  assert.deepEqual(assess(future), { status: 'incomplete', reason: 'delivery_after_evaluation' });
  const digest = fingerprint(future);
  assert.equal(digest.reason, 'delivery_after_evaluation');
  assert.equal(digest.serviceVerified, false);
  const noClaim = { ...base };
  assert.equal(assess(noClaim).reason, 'delivery_evidence_missing');
  assert.equal(matches(noClaim, digest.sha256), false);
});

test('missing preparation timestamp prevents ready-for-review even with complete delivery claim', () => {
  const claim = { ...base, deliveryEvidenceRef: 'delivery-a', deliveredAt: base.evaluatedAt };
  assert.equal(assess(claim).reason, 'preparation_timestamp_missing');
  const original = fingerprint(claim);
  assert.equal(original.status, 'incomplete');
  assert.equal(original.serviceVerified, false);
  const completed = { ...claim, preparedAt: base.evaluatedAt };
  assert.equal(assess(completed).reason, 'unverified_delivery_claim');
  assert.equal(matches(completed, original.sha256), false);
});
