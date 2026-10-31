import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

const appointment = (trusteeId, overrides = {}) => ({
  trusteeId, tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  effectiveOn: '2025-01-01', acceptedOn: '2025-01-02',
  acceptanceEvidenceRef: 'acceptance-' + trusteeId,
  ...(overrides.revokedOn != null && !Object.hasOwn(overrides, 'revocationEvidenceRef')
    ? { revocationEvidenceRef: 'revocation-' + trusteeId } : {}),
  ...overrides,
});
const snapshot = (overrides = {}) => ({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  asOfDate: '2026-10-28', mode: 'independent',
  appointments: [appointment('a'), appointment('b')], signerIds: ['a'], ...overrides,
});
const evaluate = (overrides = {}) => evaluateTrusteeSigningPolicy(snapshot(overrides));

test('one accepted active trustee satisfies independent signing policy', () => {
  assert.deepEqual(evaluate(), {
    eligible: true, reason: 'eligible_under_supplied_policy',
    activeTrusteeCount: 2, signerCount: 1,
  });
});
test('independent mode rejects zero and multiple signers', () => {
  assert.equal(evaluate({ signerIds: [] }).eligible, false);
  assert.equal(evaluate({ signerIds: ['a', 'b'] }).reason, 'independent_requires_one_active_signer');
});
test('joint mode requires all currently active accepted trustees', () => {
  assert.equal(evaluate({ mode: 'joint' }).reason, 'joint_requires_all_active_signers');
  assert.equal(evaluate({ mode: 'joint', signerIds: ['a', 'b'] }).eligible, true);
});
test('unaccepted or future-effective appointment is not active', () => {
  const appointments = [appointment('a', { acceptedOn: undefined, acceptanceEvidenceRef: undefined }),
    appointment('b', { effectiveOn: '2027-01-01' })];
  assert.equal(evaluate({ appointments }).reason, 'no_active_accepted_trustees');
});
test('orphan acceptance and revocation pointers cannot claim trustee governance events', () => {
  assert.throws(() => evaluate({
    appointments: [appointment('a', { acceptedOn: undefined })],
  }), /Unaccepted trustee appointment cannot claim acceptance evidence/);
  assert.throws(() => evaluate({
    appointments: [appointment('a', { revokedOn: undefined, revocationEvidenceRef: 'revocation-a' })],
  }), /Unrevoked trustee appointment cannot claim revocation evidence/);
  assert.equal(evaluate({
    appointments: [appointment('a', { acceptedOn: undefined, acceptanceEvidenceRef: undefined })],
  }).reason, 'no_active_accepted_trustees');
  assert.equal(evaluate({
    appointments: [appointment('a', { revokedOn: undefined })], signerIds: ['a'],
  }).eligible, true);
});
test('acceptance after evaluation date does not confer eligibility', () => {
  assert.equal(evaluate({ appointments: [appointment('a', { acceptedOn: '2026-10-29' })] }).eligible, false);
});
test('revocation date is exclusive and removes signer eligibility', () => {
  const appointments = [appointment('a', { revokedOn: '2026-10-28' }), appointment('b')];
  assert.equal(evaluate({ appointments }).reason, 'signer_not_active');
  assert.equal(evaluate({ appointments, signerIds: ['b'] }).eligible, true);
});
test('acceptance after revocation is rejected as contradictory governance evidence', () => {
  assert.throws(() => evaluate({
    appointments: [appointment('a', { acceptedOn: '2026-10-29', revokedOn: '2026-10-28' })],
  }), /acceptance must precede revocation/);
});

test('same-day acceptance and exclusive revocation cannot confer authority', () => {
  assert.throws(() => evaluate({
    appointments: [appointment('a', { acceptedOn: '2026-10-28', revokedOn: '2026-10-28' })],
  }), /acceptance must precede revocation/);
  // Prospective acceptance of a future-effective appointment is not forbidden.
  assert.equal(evaluate({
    appointments: [appointment('a', { effectiveOn: '2026-10-01', acceptedOn: '2026-09-30', revokedOn: '2026-10-29' })],
  }).eligible, true);
});

test('future successor does not silently become a joint signer', () => {
  const appointments = [appointment('a'), appointment('successor', { effectiveOn: '2027-01-01' })];
  assert.equal(evaluate({ mode: 'joint', appointments }).eligible, true);
});
test('cross-tenant/entity/trust appointment is rejected rather than counted', () => {
  for (const key of ['tenantId', 'entityId', 'trustId']) {
    assert.throws(() => evaluate({ appointments: [appointment('a', { [key]: 'other' })] }), /mismatch/);
  }
});
test('duplicate trustee appointments and signer IDs fail closed', () => {
  assert.throws(() => evaluate({ appointments: [appointment('a'), appointment('a')] }), /Duplicate trustee/);
  assert.throws(() => evaluate({ signerIds: ['a', 'a'] }), /Duplicate signer/);
});
test('unknown signers cannot satisfy a policy', () => {
  assert.equal(evaluate({ signerIds: ['unknown'] }).reason, 'signer_not_active');
});
test('rejects malformed dates, contradictory appointments and unsupported quorum', () => {
  assert.throws(() => evaluate({ asOfDate: '2026-02-30' }), /valid calendar/);
  assert.throws(() => evaluate({ appointments: [appointment('a', { revokedOn: '2024-01-01' })] }), /Revocation precedes/);
  assert.throws(() => evaluate({ mode: 'quorum' }), /Unsupported/);
});
test('does not mutate inputs and freezes assessment result', () => {
  const input = snapshot();
  const before = structuredClone(input);
  const result = evaluateTrusteeSigningPolicy(input);
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(result));
  assert.equal(Object.hasOwn(result, 'signatureVerified'), false);
});

test('rejects control characters in governance scope identifiers before evaluating signers', () => {
  for (const key of ['tenantId', 'entityId', 'trustId']) {
    for (const control of ['\u0000', '\u001f', '\u007f', '\u009f']) {
      assert.throws(() => evaluate({ [key]: 'valid' + control }), /control characters/);
    }
  }
  assert.equal(evaluate().eligible, true);
});

test('rejects control characters in appointment and signer IDs', () => {
  for (const control of ['\u0000', '\u001f', '\u007f', '\u009f']) {
    assert.throws(() => evaluate({
      appointments: [appointment('a' + control)],
      signerIds: ['a' + control],
    }), /control characters/);
    assert.throws(() => evaluate({
      appointments: [appointment('a')],
      signerIds: ['a' + control],
    }), /control characters/);
  }
  assert.equal(evaluate({ appointments: [appointment('a')], signerIds: ['a'] }).eligible, true);
});


test('accepted trustees require a distinct provenance reference before eligibility', () => {
  for (const invalid of [undefined, null, '', ' ', ' padded ', 'ref\u0000', 123]) {
    assert.throws(() => evaluate({
      appointments: [appointment('a', { acceptanceEvidenceRef: invalid })],
      signerIds: ['a'],
    }), /appointment.acceptanceEvidenceRef/);
  }
  assert.equal(evaluate({
    appointments: [appointment('a', { acceptanceEvidenceRef: 'verified-pointer-1' })],
    signerIds: ['a'],
  }).eligible, true);
});

test('different trustee appointments cannot replay the same acceptance evidence', () => {
  assert.throws(() => evaluate({
    appointments: [
      appointment('a', { acceptanceEvidenceRef: 'shared-acceptance' }),
      appointment('b', { acceptanceEvidenceRef: 'shared-acceptance' }),
    ],
    signerIds: ['a'],
  }), /Duplicate trustee acceptance evidence reference/);
  assert.equal(evaluate().eligible, true);
});


test('trustee revocations require distinct, non-replayed evidence references', () => {
  for (const invalid of [undefined, null, '', ' ', ' padded ', 'ref\u0000', 42]) {
    assert.throws(() => evaluate({
      appointments: [appointment('a', {
        revokedOn: '2026-10-28', revocationEvidenceRef: invalid,
      })],
    }), /appointment.revocationEvidenceRef/);
  }
  assert.throws(() => evaluate({
    appointments: [
      appointment('a', { revokedOn: '2026-10-28', revocationEvidenceRef: 'same-revocation' }),
      appointment('b', { revokedOn: '2026-10-28', revocationEvidenceRef: 'same-revocation' }),
    ],
  }), /Reused trustee governance evidence reference/);
  assert.throws(() => evaluate({
    appointments: [
      appointment('a', { revokedOn: '2026-10-28', revocationEvidenceRef: 'acceptance-b' }),
      appointment('b'),
    ],
  }), /Reused trustee governance evidence reference/);
  assert.throws(() => evaluate({
    appointments: [appointment('a', {
      revokedOn: '2026-10-28', revocationEvidenceRef: 'acceptance-a',
    })],
  }), /Reused trustee governance evidence reference/);
  assert.equal(evaluate({
    appointments: [
      appointment('a', { revokedOn: '2026-10-28' }), appointment('b'),
    ], signerIds: ['b'],
  }).eligible, true);
});

test('governance snapshot rejects inherited, getter-backed, hidden and unsupported authority claims', () => {
  const valid = snapshot();
  assert.throws(() => evaluateTrusteeSigningPolicy(Object.create(valid)), /plain data record/);
  let getterCalled = false;
  const accessor = { ...valid };
  Object.defineProperty(accessor, 'mode', {
    enumerable: true,
    get() { getterCalled = true; return 'independent'; },
  });
  assert.throws(() => evaluateTrusteeSigningPolicy(accessor), /enumerable data properties/);
  assert.equal(getterCalled, false);
  const hidden = { ...valid };
  Object.defineProperty(hidden, 'signatureVerified', { value: true, enumerable: false });
  assert.throws(() => evaluateTrusteeSigningPolicy(hidden), /Unsupported Governance snapshot field/);
  assert.throws(() => evaluate({ paymentAuthorized: true }), /Unsupported Governance snapshot field/);
  assert.throws(() => evaluateTrusteeSigningPolicy({ ...valid, [Symbol('approved')]: true }),
    /Unsupported Governance snapshot field/);
  const missing = { ...valid };
  delete missing.trustId;
  assert.throws(() => evaluateTrusteeSigningPolicy(missing), /Governance snapshot.trustId/);
  assert.equal(evaluateTrusteeSigningPolicy(Object.assign(Object.create(null), valid)).eligible, true);
});

test('trustee appointments require own plain-data evidence and cannot smuggle signing claims', () => {
  const valid = appointment('a');
  assert.throws(() => evaluate({ appointments: [Object.create(valid)] }), /plain data record/);
  let getterCalled = false;
  const accessor = { ...valid };
  Object.defineProperty(accessor, 'acceptedOn', {
    enumerable: true,
    get() { getterCalled = true; return '2025-01-02'; },
  });
  assert.throws(() => evaluate({ appointments: [accessor] }), /enumerable data properties/);
  assert.equal(getterCalled, false);
  const hidden = { ...valid };
  Object.defineProperty(hidden, 'identityVerified', { value: true, enumerable: false });
  assert.throws(() => evaluate({ appointments: [hidden] }), /Unsupported Trustee appointment field/);
  assert.throws(() => evaluate({ appointments: [{ ...valid, delegationAuthorized: true }] }),
    /Unsupported Trustee appointment field/);
  assert.throws(() => evaluate({ appointments: [{ ...valid, [Symbol('executed')]: true }] }),
    /Unsupported Trustee appointment field/);
  const missing = { ...valid };
  delete missing.trusteeId;
  assert.throws(() => evaluate({ appointments: [missing] }), /Trustee appointment.trusteeId/);
  assert.equal(evaluate({
    appointments: [Object.assign(Object.create(null), valid)],
    signerIds: ['a'],
  }).eligible, true);
});

test('trustee and signer lists reject sparse, accessor-backed and extra-property arrays', () => {
  for (const field of ['appointments', 'signerIds']) {
    const valid = snapshot();
    const accessor = [...valid[field]];
    let getterCalled = false;
    Object.defineProperty(accessor, '0', {
      enumerable: true,
      configurable: true,
      get() { getterCalled = true; throw new Error('unexpected getter execution'); },
    });
    assert.throws(() => evaluate({ [field]: accessor }), /enumerable data elements/);
    assert.equal(getterCalled, false);
    const sparse = [...valid[field]];
    delete sparse[0];
    assert.throws(() => evaluate({ [field]: sparse }), /must not contain holes/);
    const extra = [...valid[field]];
    Object.defineProperty(extra, 'authorized', { value: true, enumerable: false });
    assert.throws(() => evaluate({ [field]: extra }), /only array indices/);
    const symbol = [...valid[field]];
    symbol[Symbol('authority')] = true;
    assert.throws(() => evaluate({ [field]: symbol }), /only array indices/);
    const subclass = class GovernanceList extends Array {};
    assert.throws(() => evaluate({ [field]: subclass.from(valid[field]) }), /plain array/);
  }
  assert.equal(evaluate().eligible, true);
});

test('governance evidence cannot impersonate trustees, including later appointments', () => {
  for (const reversed of [false, true]) {
    const appointments = [
      appointment('a', { acceptanceEvidenceRef: 'b' }),
      appointment('b'),
    ];
    if (reversed) appointments.reverse();
    assert.throws(() => evaluate({ appointments }), /collides with identity or scope/);
  }
  for (const reversed of [false, true]) {
    const appointments = [
      appointment('a', { revokedOn: '2026-10-28', revocationEvidenceRef: 'b' }),
      appointment('b'),
    ];
    if (reversed) appointments.reverse();
    assert.throws(() => evaluate({ appointments }), /collides with identity or scope/);
  }
  assert.equal(evaluate().eligible, true);
});

test('governance evidence cannot masquerade as tenant, entity or trust scope', () => {
  for (const scopeId of ['tenant-a', 'entity-a', 'trust-a']) {
    assert.throws(() => evaluate({
      appointments: [appointment('a', { acceptanceEvidenceRef: scopeId })],
    }), /collides with identity or scope/);
    assert.throws(() => evaluate({
      appointments: [appointment('a', {
        revokedOn: '2026-10-28', revocationEvidenceRef: scopeId,
      })],
    }), /collides with identity or scope/);
  }
  assert.equal(evaluate().eligible, true);
});
