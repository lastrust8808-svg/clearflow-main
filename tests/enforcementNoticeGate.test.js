import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEnforcementNoticeEvidence as assess } from '../server/services/enforcementNoticeGate.js';
const base = {tenantId:'tenant-1',trustId:'trust-1',noteId:'note-1',noticeId:'notice-1',noticeVersionId:'version-1',preparedEvidenceRef:'prepared-1',preparedAt:'2026-11-03T09:00:00.000Z',deliveryEvidenceRef:'delivery-1',deliveredAt:'2026-11-03T10:00:00.000Z',evaluatedAt:'2026-11-03T11:00:00.000Z'};
test('missing preparation chronology cannot be review-ready', () => {
  const packet = {...base};
  delete packet.preparedAt;
  assert.deepEqual(assess(packet), {status:'incomplete',reason:'preparation_timestamp_missing'});
  assert.equal(assess({...base,preparedAt:'2026-11-03T09:00:00.000Z'}).status,'evidence_ready_for_review');
});
test('delivery claim is review-only, not verified service', () => {
  assert.deepEqual(assess(base), {status:'evidence_ready_for_review',reason:'unverified_delivery_claim'});
  assert.equal(Object.hasOwn(assess(base),'serviceVerified'),false);
  assert.ok(Object.isFrozen(assess(base)));
});
test('missing delivery evidence is incomplete', () => {
  assert.equal(assess((({deliveryEvidenceRef,deliveredAt,...rest})=>rest)(base)).reason,'delivery_evidence_missing');
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
  assert.deepEqual(assess((({deliveryEvidenceRef,...rest})=>rest)(base)), {status:'incomplete',reason:'partial_delivery_evidence'});
  assert.deepEqual(assess((({deliveredAt,...rest})=>rest)(base)), {status:'incomplete',reason:'partial_delivery_evidence'});
  assert.equal(assess((({deliveryEvidenceRef,deliveredAt,...rest})=>rest)(base)).reason,'delivery_evidence_missing');
});

test('supplied partial delivery evidence must be well-formed even when incomplete', () => {
  assert.throws(() => assess({...(({deliveredAt,...rest})=>rest)(base), deliveryEvidenceRef:base.noticeId}), /reused/);
  assert.throws(() => assess({...(({deliveredAt,...rest})=>rest)(base), deliveryEvidenceRef:'bad ref'}), /Invalid/);
  assert.throws(() => assess({...(({deliveryEvidenceRef,...rest})=>rest)(base), deliveredAt:'2026-02-30T10:00:00.000Z'}), /canonical/);
  assert.equal(assess({...(({deliveredAt,...rest})=>rest)(base), deliveryEvidenceRef:'delivery-2'}).reason,'partial_delivery_evidence');
  assert.equal(assess((({deliveryEvidenceRef,...rest})=>rest)(base)).reason,'partial_delivery_evidence');
});

test('supplied preparation timestamp must be canonical, not null or undefined', () => {
  for (const preparedAt of [null, undefined, '', 0, '2026-11-03']) {
    assert.throws(() => assess({...base, preparedAt}), /canonical/);
  }
  assert.equal(assess(base).status, 'evidence_ready_for_review');
});

test('partial delivery timestamps cannot bypass chronology checks', () => {
  assert.equal(assess({...(({deliveryEvidenceRef,...rest})=>rest)(base), deliveredAt:'2026-11-04T00:00:00.000Z'}).reason, 'delivery_after_evaluation');
  assert.equal(assess({...(({deliveryEvidenceRef,...rest})=>rest)(base), preparedAt:'2026-11-03T10:30:00.000Z'}).reason, 'delivery_before_preparation');
  assert.equal(assess((({deliveryEvidenceRef,...rest})=>rest)(base)).reason, 'partial_delivery_evidence');
});

test('invalid supplied delivery evidence is rejected before preparation chronology classification', () => {
  const futurePreparation = '2026-11-03T12:00:00.000Z';
  assert.throws(() => assess({...base, preparedAt:futurePreparation, deliveredAt:'2026-02-30T10:00:00.000Z'}), /canonical/);
  assert.throws(() => assess({...base, preparedAt:futurePreparation, deliveryEvidenceRef:base.noticeId}), /reused/);
  assert.equal(assess({...base, preparedAt:futurePreparation}).reason, 'preparation_after_evaluation');
});

test('delivery evidence cannot impersonate any notice scope or preparation identity', () => {
  for (const key of ['tenantId', 'trustId', 'noteId', 'noticeId', 'noticeVersionId', 'preparedEvidenceRef']) {
    assert.throws(() => assess({ ...base, deliveryEvidenceRef: base[key] }), /reused/, key);
  }
  for (const invalid of ['', ' ', 'delivery ref', 'delivery/1', 42, true]) {
    assert.throws(() => assess({ ...base, deliveryEvidenceRef: invalid }), /Invalid/, String(invalid));
  }
  assert.equal(assess({ ...base, deliveryEvidenceRef: 'delivery-2' }).status, 'evidence_ready_for_review');
});


test('explicit null delivery claims are rejected, not treated as omitted evidence', () => {
  assert.throws(() => assess({...base, deliveryEvidenceRef:null}), /null delivery evidence/);
  assert.throws(() => assess({...base, deliveredAt:null}), /null delivery timestamp/);
  assert.throws(() => assess({...base, deliveryEvidenceRef:null}), /null delivery evidence/);
  assert.equal(assess((({deliveryEvidenceRef,deliveredAt,...rest})=>rest)(base)).reason, 'delivery_evidence_missing');
});


test('inherited optional delivery evidence cannot fabricate a delivery claim', () => {
  const packet = {...base};
  delete packet.deliveryEvidenceRef;
  delete packet.deliveredAt;
  const originalRef = Object.getOwnPropertyDescriptor(Object.prototype, 'deliveryEvidenceRef');
  const originalAt = Object.getOwnPropertyDescriptor(Object.prototype, 'deliveredAt');
  let reads = 0;
  try {
    Object.defineProperty(Object.prototype, 'deliveryEvidenceRef', { configurable:true, get() { reads++; throw Error('inherited ref getter'); } });
    Object.defineProperty(Object.prototype, 'deliveredAt', { configurable:true, get() { reads++; throw Error('inherited time getter'); } });
    assert.equal(assess(packet).reason, 'delivery_evidence_missing');
    assert.equal(reads, 0);
  } finally {
    if (originalRef) Object.defineProperty(Object.prototype, 'deliveryEvidenceRef', originalRef);
    else delete Object.prototype.deliveryEvidenceRef;
    if (originalAt) Object.defineProperty(Object.prototype, 'deliveredAt', originalAt);
    else delete Object.prototype.deliveredAt;
  }
});


test('validated own data descriptors are used without triggering Proxy get traps', () => {
  let reads = 0;
  const packet = new Proxy({...base}, {
    get(_target, key) { reads++; throw new Error('untrusted property read: ' + String(key)); }
  });
  assert.deepEqual(assess(packet), {status:'evidence_ready_for_review',reason:'unverified_delivery_claim'});
  assert.equal(reads, 0);
});

test('optional notice field presence is resolved from a single descriptor snapshot', () => {
  const counts = new Map();
  const packet = new Proxy({...base}, {
    getOwnPropertyDescriptor(target, key) {
      counts.set(key, (counts.get(key) || 0) + 1);
      if (counts.get(key) > 1) throw new Error('repeated descriptor lookup: ' + String(key));
      return Reflect.getOwnPropertyDescriptor(target, key);
    }
  });
  assert.equal(assess(packet).status, 'evidence_ready_for_review');
  for (const count of counts.values()) assert.equal(count, 1);
});


test('explicit undefined delivery claims fail closed rather than masquerade as omission', () => {
  assert.throws(() => assess({...base, deliveryEvidenceRef:undefined}), /Undefined delivery evidence/);
  assert.throws(() => assess({...base, deliveredAt:undefined}), /Undefined delivery timestamp/);
  const {deliveryEvidenceRef, deliveredAt, ...withoutDelivery} = base;
  assert.equal(assess(withoutDelivery).reason, 'delivery_evidence_missing');
});


test('unrecognized metadata and symbol keys cannot be smuggled into review evidence', () => {
  assert.throws(() => assess({...base, serviceVerified:true}), /Unsupported or accessor/);
  const hidden = {...base};
  Object.defineProperty(hidden, 'serviceVerified', {value:true, enumerable:false});
  assert.throws(() => assess(hidden), /Unsupported or accessor/);
  const symbolic = {...base, [Symbol('serviceVerified')]:true};
  assert.throws(() => assess(symbolic), /Unsupported or accessor/);
  assert.equal(assess(base).status, 'evidence_ready_for_review');
});


test('hidden delivery and preparation claims cannot evade evidence validation', () => {
  for (const field of ['preparedAt', 'deliveryEvidenceRef', 'deliveredAt']) {
    const packet = {...base};
    Object.defineProperty(packet, field, {value:base[field], enumerable:false, configurable:true});
    assert.throws(() => assess(packet), /Unsupported or accessor/, field);
  }
  const packet = {...base};
  let reads = 0;
  Object.defineProperty(packet, 'preparedAt', {enumerable:true, get() { reads++; throw Error('unsafe preparation getter'); }});
  assert.throws(() => assess(packet), /Unsupported or accessor/);
  assert.equal(reads, 0);
});

test('required scope and evaluation fields cannot be inherited or accessor-backed', () => {
  for (const field of ['tenantId', 'trustId', 'noteId', 'noticeId', 'noticeVersionId', 'preparedEvidenceRef', 'evaluatedAt']) {
    let reads = 0;
    const accessor = {...base};
    Object.defineProperty(accessor, field, {enumerable:true, configurable:true, get() { reads++; throw Error('untrusted getter'); }});
    assert.throws(() => assess(accessor), /Unsupported or accessor/, field);
    assert.equal(reads, 0, field);

    const inherited = {...base};
    delete inherited[field];
    const original = Object.getOwnPropertyDescriptor(Object.prototype, field);
    try {
      Object.defineProperty(Object.prototype, field, {configurable:true, get() { reads++; throw Error('inherited getter'); }});
      assert.throws(() => assess(inherited), /Invalid notice identifier|Invalid canonical UTC timestamp/, field);
      assert.equal(reads, 0, field);
    } finally {
      if (original) Object.defineProperty(Object.prototype, field, original);
      else delete Object.prototype[field];
    }
  }
});
