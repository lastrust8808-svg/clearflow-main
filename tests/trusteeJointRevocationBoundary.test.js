import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

// Policy-only boundary tests. These do not authenticate trustees or sign documents.
const appointment = (trusteeId, overrides = {}) => ({
  trusteeId, tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  effectiveOn: '2026-11-01', acceptedOn: '2026-11-02',
  acceptanceEvidenceRef: 'accept-' + trusteeId, ...overrides,
});
const evaluate = (overrides = {}) => evaluateTrusteeSigningPolicy({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  asOfDate: '2026-11-13', mode: 'joint',
  appointments: [appointment('trustee-a'), appointment('trustee-b')],
  signerIds: ['trustee-a', 'trustee-b'], ...overrides,
});

test('joint signing requires every currently active trustee, not a historical revoked trustee', () => {
  const revoked = appointment('trustee-b', {
    revokedOn: '2026-11-12', revocationEvidenceRef: 'revoke-b',
  });
  assert.equal(evaluate({
    appointments: [appointment('trustee-a'), revoked],
    signerIds: ['trustee-a'],
  }).eligible, true);
  assert.equal(evaluate({
    appointments: [appointment('trustee-a'), revoked],
    signerIds: ['trustee-a', 'trustee-b'],
  }).reason, 'signer_not_active');
});

test('joint signing cannot omit a trustee whose revocation becomes effective tomorrow', () => {
  const futureRevocation = appointment('trustee-b', {
    revokedOn: '2026-11-14', revocationEvidenceRef: 'revoke-b',
  });
  assert.equal(evaluate({
    appointments: [appointment('trustee-a'), futureRevocation],
    signerIds: ['trustee-a'],
  }).reason, 'joint_requires_all_active_signers');
  assert.equal(evaluate({
    appointments: [appointment('trustee-a'), futureRevocation],
  }).eligible, true);
});

test('future acceptance cannot count toward joint signing before its effective date', () => {
  const futureAccepted = appointment('trustee-b', {
    acceptedOn: '2026-11-14',
  });
  assert.equal(evaluate({
    appointments: [appointment('trustee-a'), futureAccepted],
    signerIds: ['trustee-a'],
  }).eligible, true);
  assert.equal(evaluate({
    appointments: [appointment('trustee-a'), futureAccepted],
    signerIds: ['trustee-a', 'trustee-b'],
  }).reason, 'signer_not_active');
});
