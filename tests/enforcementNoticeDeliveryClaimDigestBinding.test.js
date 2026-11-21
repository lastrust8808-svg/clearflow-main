import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprintEnforcementNoticeEvidence,
  matchesEnforcementNoticeEvidenceFingerprint
} from '../server/services/enforcementNoticeFingerprint.js';

const base = {
  tenantId: 'tenant-1', trustId: 'trust-1', noteId: 'note-1',
  noticeId: 'notice-1', noticeVersionId: 'version-1',
  preparedEvidenceRef: 'prepared-1',
  preparedAt: '2026-11-03T09:00:00.000Z',
  deliveryEvidenceRef: 'delivery-1',
  deliveredAt: '2026-11-03T10:00:00.000Z',
  evaluatedAt: '2026-11-03T11:00:00.000Z'
};

test('claimed delivery evidence never becomes proof of service through fingerprinting', () => {
  const result = fingerprintEnforcementNoticeEvidence(base);
  assert.equal(result.status, 'evidence_ready_for_review');
  assert.equal(result.reason, 'unverified_delivery_claim');
  assert.equal(result.serviceVerified, false);
  assert.equal(Object.isFrozen(result), true);
});

test('delivery evidence identity, timestamp and notice version are digest-bound', () => {
  const digest = fingerprintEnforcementNoticeEvidence(base).sha256;
  for (const change of [
    { deliveryEvidenceRef: 'delivery-2' },
    { deliveredAt: '2026-11-03T10:01:00.000Z' },
    { noticeVersionId: 'version-2' }
  ]) {
    assert.equal(matchesEnforcementNoticeEvidenceFingerprint({ ...base, ...change }, digest), false);
  }
});

test('canonical field ordering cannot change the audit digest', () => {
  const reverse = Object.fromEntries(Object.entries(base).reverse());
  assert.equal(fingerprintEnforcementNoticeEvidence(reverse).sha256,
    fingerprintEnforcementNoticeEvidence(base).sha256);
});
