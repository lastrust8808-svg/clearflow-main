import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence } from '../server/services/enforcementNoticeGate.js';

const valid = Object.freeze({
  tenantId:'tenant-1', trustId:'trust-1', noteId:'note-1', noticeId:'notice-1',
  noticeVersionId:'version-1', preparedEvidenceRef:'prepared-1',
  preparedAt:'2026-11-03T09:00:00.000Z', deliveryEvidenceRef:'delivery-1',
  deliveredAt:'2026-11-03T10:00:00.000Z', evaluatedAt:'2026-11-03T11:00:00.000Z'
});

test('untrusted notice ownKeys failure never becomes delivery evidence', () => {
  let reads = 0;
  const packet = new Proxy({...valid}, {
    ownKeys() { throw new Error('untrusted notice enumeration'); },
    get() { reads++; throw new Error('untrusted field read'); }
  });
  assert.throws(() => assessEnforcementNoticeEvidence(packet), /untrusted notice enumeration/);
  assert.equal(reads, 0);
});

test('untrusted notice descriptor failure never becomes review-ready', () => {
  let reads = 0;
  const packet = new Proxy({...valid}, {
    getOwnPropertyDescriptor(target, key) {
      if (key === 'deliveredAt') throw new Error('untrusted delivery descriptor');
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    get() { reads++; throw new Error('untrusted field read'); }
  });
  assert.throws(() => assessEnforcementNoticeEvidence(packet), /untrusted delivery descriptor/);
  assert.equal(reads, 0);
  assert.deepEqual(assessEnforcementNoticeEvidence({...valid}),
    {status:'evidence_ready_for_review',reason:'unverified_delivery_claim'});
});
