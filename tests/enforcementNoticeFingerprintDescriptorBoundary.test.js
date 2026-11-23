import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprintEnforcementNoticeEvidence,
  matchesEnforcementNoticeEvidenceFingerprint
} from '../server/services/enforcementNoticeFingerprint.js';

const packet = {
  tenantId: 'tenant-1', trustId: 'trust-1', noteId: 'note-1',
  noticeId: 'notice-1', noticeVersionId: 'version-1',
  preparedEvidenceRef: 'prepared-1', preparedAt: '2026-11-03T09:00:00.000Z',
  evaluatedAt: '2026-11-03T11:00:00.000Z'
};

test('hidden accessor metadata fails closed without executing its getter', () => {
  let reads = 0;
  const candidate = { ...packet };
  Object.defineProperty(candidate, 'secretServiceClaim', {
    enumerable: false,
    get() { reads++; throw new Error('getter must not execute'); }
  });
  assert.throws(() => fingerprintEnforcementNoticeEvidence(candidate), /Unsupported or accessor/);
  assert.equal(reads, 0);
});

test('descriptor-trap failure cannot produce a notice fingerprint', () => {
  const candidate = new Proxy({ ...packet }, {
    getOwnPropertyDescriptor(target, key) {
      if (key === 'preparedEvidenceRef') throw new Error('descriptor-unavailable');
      return Reflect.getOwnPropertyDescriptor(target, key);
    }
  });
  assert.throws(() => fingerprintEnforcementNoticeEvidence(candidate), /descriptor-unavailable/);
});

test('digest comparison remains an audit comparison, never delivery verification', () => {
  const baseline = fingerprintEnforcementNoticeEvidence({ ...packet });
  assert.equal(matchesEnforcementNoticeEvidenceFingerprint({ ...packet }, baseline.sha256), true);
  assert.equal(matchesEnforcementNoticeEvidenceFingerprint({ ...packet, evaluatedAt: '2026-11-03T11:01:00.000Z' }, baseline.sha256), false);
  assert.equal(baseline.serviceVerified, false);
  assert.equal(Object.isFrozen(baseline), true);
  assert.throws(() => matchesEnforcementNoticeEvidenceFingerprint(packet, baseline.sha256.toUpperCase()), /Canonical SHA-256/);
});
