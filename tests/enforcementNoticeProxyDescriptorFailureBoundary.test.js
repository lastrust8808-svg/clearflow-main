import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence as assess } from '../server/services/enforcementNoticeGate.js';

// These are untrusted claim packets, not evidence of legal service.
const packet = () => ({
  tenantId:'tenant-a', trustId:'trust-a', noteId:'note-a',
  noticeId:'notice-a', noticeVersionId:'version-a',
  preparedEvidenceRef:'prepared-a', preparedAt:'2026-11-01T09:00:00.000Z',
  deliveryEvidenceRef:'delivery-a', deliveredAt:'2026-11-01T10:00:00.000Z',
  evaluatedAt:'2026-11-01T11:00:00.000Z',
});

test('hostile notice ownKeys failure cannot be converted to review-ready delivery', () => {
  let reads = 0;
  const hostile = new Proxy(packet(), {
    ownKeys() { throw new Error('notice enumeration failed'); },
    get() { reads++; throw new Error('notice getter must not execute'); },
  });
  assert.throws(() => assess(hostile), /notice enumeration failed/);
  assert.equal(reads, 0);
});

test('hostile notice descriptor failure cannot be converted to review-ready delivery', () => {
  let reads = 0;
  const hostile = new Proxy(packet(), {
    getOwnPropertyDescriptor(target, key) {
      if (key === 'deliveryEvidenceRef') throw new Error('notice descriptor failed');
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    get() { reads++; throw new Error('notice getter must not execute'); },
  });
  assert.throws(() => assess(hostile), /notice descriptor failed/);
  assert.equal(reads, 0);
});

test('inconsistent proxy descriptor claims cannot manufacture verified service', () => {
  const hostile = new Proxy(packet(), {
    getOwnPropertyDescriptor(target, key) {
      if (key === 'deliveryEvidenceRef') return undefined;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.equal(assess(hostile).status, 'incomplete');
  assert.equal(assess(packet()).status, 'evidence_ready_for_review');
  assert.equal(Object.hasOwn(assess(packet()), 'serviceVerified'), false);
});
