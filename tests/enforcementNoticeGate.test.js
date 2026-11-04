import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence as assess } from '../server/services/enforcementNoticeGate.js';
const base = {tenantId:'tenant-1',trustId:'trust-1',noteId:'note-1',noticeId:'notice-1',noticeVersionId:'version-1',preparedEvidenceRef:'prepared-1',deliveryEvidenceRef:'delivery-1',deliveredAt:'2026-11-03T10:00:00.000Z',evaluatedAt:'2026-11-03T11:00:00.000Z'};
test('delivery claim is review-only, not verified service', () => {
  assert.deepEqual(assess(base), {status:'evidence_ready_for_review',reason:'unverified_delivery_claim'});
  assert.equal(Object.hasOwn(assess(base),'serviceVerified'),false);
  assert.ok(Object.isFrozen(assess(base)));
});
test('missing delivery evidence is incomplete', () => {
  assert.equal(assess({...base,deliveryEvidenceRef:undefined,deliveredAt:undefined}).reason,'delivery_evidence_missing');
});
test('cross-role evidence replay is rejected', () => {
  for (const ref of [base.preparedEvidenceRef,base.noteId,base.noticeId]) {
    assert.throws(() => assess({...base,deliveryEvidenceRef:ref}),/reused/);
  }
});
test('future and invalid delivery timestamps fail closed', () => {
  assert.equal(assess({...base,deliveredAt:'2026-11-04T00:00:00.000Z'}).reason,'delivery_after_evaluation');
  assert.throws(() => assess({...base,deliveredAt:'2026-02-30T10:00:00.000Z'}),/canonical/);
});
test('accessor-backed claims cannot execute getters', () => {
  let calls=0;
  const p={...base};
  Object.defineProperty(p,'deliveryEvidenceRef',{enumerable:true,get(){calls++;throw Error('getter');}});
  assert.throws(() => assess(p),/accessor/);
  assert.equal(calls,0);
});

test('optional preparation timestamp enforces chronological delivery evidence', () => {
  assert.equal(assess({...base,preparedAt:'2026-11-03T09:00:00.000Z'}).status,'evidence_ready_for_review');
  assert.equal(assess({...base,preparedAt:'2026-11-03T10:30:00.000Z'}).reason,'delivery_before_preparation');
  assert.equal(assess({...base,preparedAt:'2026-11-03T12:00:00.000Z'}).reason,'preparation_after_evaluation');
  assert.throws(() => assess({...base,preparedAt:'2026-02-30T09:00:00.000Z'}),/canonical/);
  assert.equal(assess(base).status,'evidence_ready_for_review');
});

test('partial delivery claims are incomplete rather than review-ready', () => {
  assert.deepEqual(assess({...base,deliveryEvidenceRef:undefined}), {status:'incomplete',reason:'partial_delivery_evidence'});
  assert.deepEqual(assess({...base,deliveredAt:undefined}), {status:'incomplete',reason:'partial_delivery_evidence'});
  assert.equal(assess({...base,deliveryEvidenceRef:undefined,deliveredAt:undefined}).reason,'delivery_evidence_missing');
});

test('supplied partial delivery evidence must be well-formed even when incomplete', () => {
  assert.throws(() => assess({...base, deliveryEvidenceRef:base.noticeId, deliveredAt:undefined}), /reused/);
  assert.throws(() => assess({...base, deliveryEvidenceRef:'bad ref', deliveredAt:undefined}), /Invalid/);
  assert.throws(() => assess({...base, deliveryEvidenceRef:undefined, deliveredAt:'2026-02-30T10:00:00.000Z'}), /canonical/);
  assert.equal(assess({...base, deliveryEvidenceRef:'delivery-2', deliveredAt:undefined}).reason,'partial_delivery_evidence');
  assert.equal(assess({...base, deliveryEvidenceRef:undefined, deliveredAt:base.deliveredAt}).reason,'partial_delivery_evidence');
});

test('supplied preparation timestamp must be canonical, not null or undefined', () => {
  for (const preparedAt of [null, undefined, '', 0, '2026-11-03']) {
    assert.throws(() => assess({...base, preparedAt}), /canonical/);
  }
  assert.equal(assess(base).status, 'evidence_ready_for_review');
});

test('partial delivery timestamps cannot bypass chronology checks', () => {
  assert.equal(assess({...base, deliveryEvidenceRef:undefined, deliveredAt:'2026-11-04T00:00:00.000Z'}).reason, 'delivery_after_evaluation');
  assert.equal(assess({...base, deliveryEvidenceRef:undefined, preparedAt:'2026-11-03T10:30:00.000Z'}).reason, 'delivery_before_preparation');
  assert.equal(assess({...base, deliveryEvidenceRef:undefined, deliveredAt:base.deliveredAt}).reason, 'partial_delivery_evidence');
});

test('invalid supplied delivery evidence is rejected before preparation chronology classification', () => {
  const futurePreparation = '2026-11-03T12:00:00.000Z';
  assert.throws(() => assess({...base, preparedAt:futurePreparation, deliveredAt:'2026-02-30T10:00:00.000Z'}), /canonical/);
  assert.throws(() => assess({...base, preparedAt:futurePreparation, deliveryEvidenceRef:base.noticeId}), /reused/);
  assert.equal(assess({...base, preparedAt:futurePreparation}).reason, 'preparation_after_evaluation');
});
