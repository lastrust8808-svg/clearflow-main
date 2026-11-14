import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintEnforcementNoticeEvidence as fingerprint } from '../server/services/enforcementNoticeFingerprint.js';

const base = {
  tenantId: 'tenant-1', trustId: 'trust-1', noteId: 'note-1',
  noticeId: 'notice-1', noticeVersionId: 'version-1',
  preparedEvidenceRef: 'prepared-1', preparedAt: '2026-11-03T09:00:00.000Z',
  evaluatedAt: '2026-11-03T11:00:00.000Z'
};

test('incomplete delivery evidence remains non-authoritative and omission is fingerprinted', () => {
  const missing = fingerprint(base);
  const partialRef = fingerprint({ ...base, deliveryEvidenceRef: 'delivery-1' });
  const partialTime = fingerprint({ ...base, deliveredAt: '2026-11-03T10:00:00.000Z' });
  for (const result of [missing, partialRef, partialTime]) {
    assert.equal(result.status, 'incomplete');
    assert.equal(result.serviceVerified, false);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(missing.reason, 'delivery_evidence_missing');
  assert.equal(partialRef.reason, 'partial_delivery_evidence');
  assert.equal(partialTime.reason, 'partial_delivery_evidence');
  assert.equal(new Set([missing.sha256, partialRef.sha256, partialTime.sha256]).size, 3);
});

test('fingerprint fails closed for hostile Proxy descriptor enumeration', () => {
  const hostile = new Proxy(base, {
    ownKeys() { throw new Error('blocked-own-keys'); }
  });
  assert.throws(() => fingerprint(hostile), /blocked-own-keys/);
});

test('fingerprint rejects unknown fields, symbols, and accessor fields', () => {
  assert.throws(() => fingerprint({ ...base, extra: 'untrusted' }), /Unsupported or accessor/);
  assert.throws(() => fingerprint({ ...base, [Symbol('extra')]: 'untrusted' }), /Unsupported or accessor/);
  let reads = 0;
  const accessor = { ...base };
  Object.defineProperty(accessor, 'preparedAt', {
    enumerable: true, get() { reads++; throw new Error('must-not-run'); }
  });
  assert.throws(() => fingerprint(accessor), /Unsupported or accessor/);
  assert.equal(reads, 0);
});

test('fingerprint rejects non-plain evidence packets rather than laundering their prototype', () => {
  const inherited = Object.create({ inheritedClaim: 'trusted' });
  Object.assign(inherited, base);
  assert.throws(() => fingerprint(inherited), /Plain notice packet required/);
  const nullPrototype = Object.assign(Object.create(null), base);
  assert.throws(() => fingerprint(nullPrototype), /Plain notice packet required/);
  class NoticePacket { constructor() { Object.assign(this, base); } }
  assert.throws(() => fingerprint(new NoticePacket()), /Plain notice packet required/);
  assert.throws(() => fingerprint(null), /Plain notice packet required/);
  const proxy = new Proxy({ ...base }, { getPrototypeOf() { throw new Error('prototype-blocked'); } });
  assert.throws(() => fingerprint(proxy), /prototype-blocked/);
  assert.equal(fingerprint({ ...base }).serviceVerified, false);
});
