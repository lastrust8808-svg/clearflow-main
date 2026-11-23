import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintEnforcementNoticeEvidence, matchesEnforcementNoticeEvidenceFingerprint } from '../server/services/enforcementNoticeFingerprint.js';
import { assessEnforcementNoticeEvidence } from '../server/services/enforcementNoticeGate.js';

const valid = {
  tenantId: 'tenant-1', trustId: 'trust-1', noteId: 'note-1',
  noticeId: 'notice-1', noticeVersionId: 'version-1',
  preparedEvidenceRef: 'prepared-1', preparedAt: '2026-11-03T09:00:00.000Z',
  deliveryEvidenceRef: 'delivery-1', deliveredAt: '2026-11-03T10:00:00.000Z',
  evaluatedAt: '2026-11-03T11:00:00.000Z'
};

test('own prototype-sensitive notice fields cannot enter assessment or audit fingerprints', () => {
  const expected = fingerprintEnforcementNoticeEvidence(valid).sha256;
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const packet = { ...valid };
    Object.defineProperty(packet, key, {
      value: { forged: 'delivery_verified' }, enumerable: true, configurable: true
    });
    assert.throws(() => assessEnforcementNoticeEvidence(packet), /Unsupported or accessor notice field/, key);
    assert.throws(() => fingerprintEnforcementNoticeEvidence(packet), /Unsupported or accessor notice field/, key);
    assert.throws(() => matchesEnforcementNoticeEvidenceFingerprint(packet, expected), /Unsupported or accessor notice field/, key);
  }
  assert.equal(Object.prototype.forged, undefined);
  assert.equal(matchesEnforcementNoticeEvidenceFingerprint(valid, expected), true);
});
