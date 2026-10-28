import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

const appointment = (trusteeId, overrides = {}) => ({
  trusteeId, tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  effectiveOn: '2025-01-01', acceptedOn: '2025-01-02', ...overrides,
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
  const appointments = [appointment('a', { acceptedOn: undefined }),
    appointment('b', { effectiveOn: '2027-01-01' })];
  assert.equal(evaluate({ appointments }).reason, 'no_active_accepted_trustees');
});
test('acceptance after evaluation date does not confer eligibility', () => {
  assert.equal(evaluate({ appointments: [appointment('a', { acceptedOn: '2026-10-29' })] }).eligible, false);
});
test('revocation date is exclusive and removes signer eligibility', () => {
  const appointments = [appointment('a', { revokedOn: '2026-10-28' }), appointment('b')];
  assert.equal(evaluate({ appointments }).reason, 'signer_not_active');
  assert.equal(evaluate({ appointments, signerIds: ['b'] }).eligible, true);
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
