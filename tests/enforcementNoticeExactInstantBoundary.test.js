import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprintEnforcementNoticeEvidence as fingerprint,
  matchesEnforcementNoticeEvidenceFingerprint as matches,
} from '../server/services/enforcementNoticeFingerprint.js';

// Equality at the review instant is an admissible claim, not proof of service.
const packet = {
  tenantId: 'tenant-a', trustId: 'trust-a', noteId: 'note-a',
  noticeId: 'notice-a', noticeVersionId: 'version-a',
  preparedEvidenceRef: 'prepared-a',
  preparedAt: '2026-11-18T12:00:00.000Z',
  deliveryEvidenceRef: 'delivery-a',
  deliveredAt: '2026-11-18T12:00:00.001Z',
  evaluatedAt: '2026-11-18T12:00:00.001Z',
};

test('exact review-time delivery claim remains unverified and fingerprint-bound', () => {
  const result = fingerprint(packet);
  assert.equal(result.status, 'evidence_ready_for_review');
  assert.equal(result.reason, 'unverified_delivery_claim');
  assert.equal(result.serviceVerified, false);
  assert.equal(matches(packet, result.sha256), true);
  const later = { ...packet, deliveredAt: '2026-11-18T12:00:00.002Z' };
  const future = fingerprint(later);
  assert.equal(future.status, 'incomplete');
  assert.equal(future.reason, 'delivery_after_evaluation');
  assert.equal(future.serviceVerified, false);
  assert.equal(matches(later, result.sha256), false);
});

test('preparation and delivery at identical instant are reviewable but not service', () => {
  const sameInstant = { ...packet, preparedAt: packet.deliveredAt };
  const result = fingerprint(sameInstant);
  assert.equal(result.status, 'evidence_ready_for_review');
  assert.equal(result.serviceVerified, false);
  assert.notEqual(result.sha256, fingerprint(packet).sha256);
  assert.equal(matches(sameInstant, result.sha256), true);
});
