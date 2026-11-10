import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintEnforcementNoticeEvidence as fingerprint } from '../server/services/enforcementNoticeFingerprint.js';

const base = {tenantId:'tenant-1',trustId:'trust-1',noteId:'note-1',noticeId:'notice-1',noticeVersionId:'version-1',preparedEvidenceRef:'prepared-1',preparedAt:'2026-11-03T09:00:00.000Z',deliveryEvidenceRef:'delivery-1',deliveredAt:'2026-11-03T10:00:00.000Z',evaluatedAt:'2026-11-03T11:00:00.000Z'};

test('notice evidence fingerprint is stable under key reordering and never verifies service', () => {
  const first = fingerprint(base);
  assert.match(first.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(fingerprint(Object.fromEntries(Object.entries(base).reverse())), first);
  assert.equal(first.serviceVerified, false);
  assert.ok(Object.isFrozen(first));
});

test('notice evidence fingerprint binds scope, evidence and evaluation time', () => {
  const original = fingerprint(base).sha256;
  for (const [key, value] of [['tenantId','tenant-2'],['deliveryEvidenceRef','delivery-2'],['evaluatedAt','2026-11-03T11:00:00.001Z']]) {
    assert.notEqual(fingerprint({...base,[key]:value}).sha256, original, key);
  }
});

test('invalid evidence fails closed without reading accessor values', () => {
  let reads=0;
  const packet={...base};
  Object.defineProperty(packet,'deliveredAt',{enumerable:true,get(){reads++;throw Error('unsafe');}});
  assert.throws(()=>fingerprint(packet),/Unsupported or accessor/);
  assert.equal(reads,0);
});

// A preparation-only packet is auditable, but must never be treated as delivery.
test('fingerprint distinguishes missing delivery from partial delivery claims', () => {
  const { deliveryEvidenceRef, deliveredAt, ...preparedOnly } = base;
  const absent = fingerprint(preparedOnly);
  const referenceOnly = fingerprint({ ...preparedOnly, deliveryEvidenceRef });
  const timestampOnly = fingerprint({ ...preparedOnly, deliveredAt });
  assert.equal(absent.status, 'incomplete');
  assert.equal(absent.reason, 'delivery_evidence_missing');
  for (const partial of [referenceOnly, timestampOnly]) {
    assert.equal(partial.status, 'incomplete');
    assert.equal(partial.reason, 'partial_delivery_evidence');
    assert.equal(partial.serviceVerified, false);
    assert.notEqual(partial.sha256, absent.sha256);
  }
  assert.notEqual(referenceOnly.sha256, timestampOnly.sha256);
  assert.notEqual(fingerprint(base).sha256, referenceOnly.sha256);
});
