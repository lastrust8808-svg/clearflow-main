import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprintEnforcementNoticeEvidence,
  matchesEnforcementNoticeEvidenceFingerprint
} from '../server/services/enforcementNoticeFingerprint.js';

const packet = Object.freeze({
  tenantId: 'tenant-a', trustId: 'trust-a', noteId: 'note-a',
  noticeId: 'notice-a', noticeVersionId: 'version-a',
  preparedEvidenceRef: 'preparation-a',
  preparedAt: '2026-11-18T09:00:00.000Z',
  deliveryEvidenceRef: 'delivery-a',
  deliveredAt: '2026-11-18T10:00:00.000Z',
  evaluatedAt: '2026-11-18T11:00:00.000Z'
});

test('notice evidence fingerprint binds all scope identifiers and preparation identity', () => {
  const digest = fingerprintEnforcementNoticeEvidence(packet).sha256;
  assert.equal(matchesEnforcementNoticeEvidenceFingerprint(packet, digest), true);
  for (const field of ['tenantId', 'trustId', 'noteId', 'noticeId', 'noticeVersionId', 'preparedEvidenceRef']) {
    const altered = { ...packet, [field]: field + '-other' };
    assert.equal(matchesEnforcementNoticeEvidenceFingerprint(altered, digest), false, field);
    assert.equal(fingerprintEnforcementNoticeEvidence(altered).serviceVerified, false);
  }
});

test('notice fingerprint comparison rejects noncanonical digests without accepting service claims', () => {
  const digest = fingerprintEnforcementNoticeEvidence(packet).sha256;
  for (const invalid of [digest.toUpperCase(), '0x' + digest, digest + ' ', digest.slice(1), '', null, 123]) {
    assert.throws(() => matchesEnforcementNoticeEvidenceFingerprint(packet, invalid), TypeError);
  }
});
