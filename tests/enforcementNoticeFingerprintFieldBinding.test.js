import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintEnforcementNoticeEvidence as fingerprint } from '../server/services/enforcementNoticeFingerprint.js';

const packet = Object.freeze({
  tenantId: 'tenant-a', trustId: 'trust-a', noteId: 'note-a',
  noticeId: 'notice-a', noticeVersionId: 'version-a',
  preparedEvidenceRef: 'preparation-a',
  preparedAt: '2026-11-03T09:00:00.000Z',
  deliveryEvidenceRef: 'delivery-a',
  deliveredAt: '2026-11-03T10:00:00.000Z',
  evaluatedAt: '2026-11-03T11:00:00.000Z'
});

test('fingerprint commits to every notice identity, evidence reference and timestamp', () => {
  const original = fingerprint(packet);
  for (const key of Object.keys(packet)) {
    const replacement = key.endsWith('At')
      ? '2026-11-03T09:30:00.000Z'
      : packet[key] + '-changed';
    const changed = fingerprint({ ...packet, [key]: replacement });
    assert.notEqual(changed.sha256, original.sha256, key);
    assert.equal(changed.serviceVerified, false, key);
  }
});

test('omitting delivery fields is distinct from an explicit partial claim', () => {
  const { deliveryEvidenceRef, deliveredAt, ...missing } = packet;
  const absent = fingerprint(missing);
  const partialReference = fingerprint({ ...missing, deliveryEvidenceRef });
  const partialTimestamp = fingerprint({ ...missing, deliveredAt });
  assert.equal(absent.status, 'incomplete');
  assert.equal(partialReference.status, 'incomplete');
  assert.equal(partialTimestamp.status, 'incomplete');
  assert.equal(new Set([absent.sha256, partialReference.sha256, partialTimestamp.sha256]).size, 3);
});
