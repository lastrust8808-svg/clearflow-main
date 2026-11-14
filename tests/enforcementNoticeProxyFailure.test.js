import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence as assess } from '../server/services/enforcementNoticeGate.js';

const valid = Object.freeze({
  tenantId:'tenant-1', trustId:'trust-1', noteId:'note-1', noticeId:'notice-1',
  noticeVersionId:'version-1', preparedEvidenceRef:'prepared-1',
  preparedAt:'2026-11-03T09:00:00.000Z', deliveryEvidenceRef:'delivery-1',
  deliveredAt:'2026-11-03T10:00:00.000Z', evaluatedAt:'2026-11-03T11:00:00.000Z'
});

for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) {
  test('enforcement evidence fails closed when Proxy ' + trap + ' refuses inspection', () => {
    let getterCalls = 0;
    const target = {...valid};
    Object.defineProperty(target, 'untrustedGetter', {enumerable:true, get() {getterCalls++; throw Error('getter executed');}});
    const packet = new Proxy(target, {
      [trap]() {throw new Error('inspection denied: ' + trap);},
      get() {getterCalls++; throw Error('unsafe property read');}
    });
    assert.throws(() => assess(packet), /inspection denied/);
    assert.equal(getterCalls, 0);
  });
}

test('normal notice evidence remains review-only after proxy inspection hardening', () => {
  assert.deepEqual(assess({...valid}), {status:'evidence_ready_for_review', reason:'unverified_delivery_claim'});
});
