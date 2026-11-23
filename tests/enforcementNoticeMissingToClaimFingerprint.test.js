import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintEnforcementNoticeEvidence, matchesEnforcementNoticeEvidenceFingerprint } from '../server/services/enforcementNoticeFingerprint.js';

const base = Object.freeze({
  tenantId: 'tenant-a', trustId: 'trust-a', noteId: 'note-a',
  noticeId: 'notice-a', noticeVersionId: 'version-a',
  preparedEvidenceRef: 'prepared-a',
  preparedAt: '2026-11-18T09:00:00.000Z',
  evaluatedAt: '2026-11-18T12:00:00.000Z'
});

test('delivery evidence cannot be silently appended to an earlier missing-evidence fingerprint', () => {
  const missing = fingerprintEnforcementNoticeEvidence(base);
  assert.equal(missing.status, 'incomplete');
  assert.equal(missing.reason, 'delivery_evidence_missing');
  const claimed = {
    ...base, deliveryEvidenceRef: 'delivery-a',
    deliveredAt: '2026-11-18T10:00:00.000Z'
  };
  const review = fingerprintEnforcementNoticeEvidence(claimed);
  assert.equal(review.status, 'evidence_ready_for_review');
  assert.equal(review.reason, 'unverified_delivery_claim');
  assert.notEqual(missing.sha256, review.sha256);
  assert.equal(matchesEnforcementNoticeEvidenceFingerprint(claimed, missing.sha256), false);
  assert.equal(matchesEnforcementNoticeEvidenceFingerprint(base, review.sha256), false);
  assert.equal(review.serviceVerified, false);
});

test('notice evidence fingerprint binds evaluation clock even without delivery evidence', () => {
  const initial = fingerprintEnforcementNoticeEvidence(base);
  const later = { ...base, evaluatedAt: '2026-11-18T12:00:00.001Z' };
  assert.equal(matchesEnforcementNoticeEvidenceFingerprint(later, initial.sha256), false);
  assert.equal(fingerprintEnforcementNoticeEvidence(later).serviceVerified, false);
});
