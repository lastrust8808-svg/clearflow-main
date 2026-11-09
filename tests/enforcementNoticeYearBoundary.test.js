import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence as assess } from '../server/services/enforcementNoticeGate.js';

const base = Object.freeze({
  tenantId:'tenant-1', trustId:'trust-1', noteId:'note-1',
  noticeId:'notice-1', noticeVersionId:'version-1',
  preparedEvidenceRef:'prepared-1', deliveryEvidenceRef:'delivery-1',
  preparedAt:'2026-12-31T23:59:59.999Z',
  deliveredAt:'2027-01-01T00:00:00.000Z',
  evaluatedAt:'2027-01-01T00:00:00.001Z'
});

test('year rollover does not falsely invert valid notice chronology', () => {
  assert.deepEqual(assess({...base}), {
    status:'evidence_ready_for_review', reason:'unverified_delivery_claim'
  });
});

test('year rollover chronology fails closed for one-millisecond inversions', () => {
  assert.equal(assess({...base, deliveredAt:'2026-12-31T23:59:59.998Z'}).reason, 'delivery_before_preparation');
  assert.equal(assess({...base, deliveredAt:'2027-01-01T00:00:00.002Z'}).reason, 'delivery_after_evaluation');
  assert.equal(assess({...base, preparedAt:'2027-01-01T00:00:00.002Z'}).reason, 'preparation_after_evaluation');
});

test('partial evidence cannot hide year-boundary chronological contradictions', () => {
  const {deliveryEvidenceRef, ...partial} = base;
  assert.equal(assess({...partial, deliveredAt:'2026-12-31T23:59:59.998Z'}).reason, 'delivery_before_preparation');
  assert.equal(assess({...partial, deliveredAt:'2027-01-01T00:00:00.002Z'}).reason, 'delivery_after_evaluation');
  assert.equal(assess(partial).reason, 'partial_delivery_evidence');
});

test('leap-day notice chronology accepts real February 29 and rejects impossible dates', () => {
  const leap = {
    ...base,
    preparedAt:'2028-02-29T23:59:59.998Z',
    deliveredAt:'2028-02-29T23:59:59.999Z',
    evaluatedAt:'2028-03-01T00:00:00.000Z'
  };
  assert.deepEqual(assess(leap), {
    status:'evidence_ready_for_review', reason:'unverified_delivery_claim'
  });
  for (const key of ['preparedAt', 'deliveredAt', 'evaluatedAt']) {
    assert.throws(
      () => assess({...leap, [key]:'2027-02-29T23:59:59.999Z'}),
      /Invalid canonical UTC timestamp/,
      key
    );
  }
  assert.equal(assess({...leap, deliveredAt:'2028-02-29T23:59:59.997Z'}).reason, 'delivery_before_preparation');
  assert.equal(assess({...leap, deliveredAt:'2028-03-01T00:00:00.001Z'}).reason, 'delivery_after_evaluation');
});
