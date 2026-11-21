import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

// Structural governance checks only; no identity, authority or signature verification.
const appointment = (trusteeId, extra = {}) => ({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  trusteeId, effectiveOn: '2026-11-01',
  acceptedOn: '2026-11-02', acceptanceEvidenceRef: 'accept-' + trusteeId,
  ...extra,
});
const assess = (appointments, signerIds, mode = 'joint') =>
  evaluateTrusteeSigningPolicy({
    tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
    asOfDate: '2026-11-13', mode, appointments, signerIds,
  });

test('joint governance cannot omit an accepted trustee whose revocation is future dated', () => {
  const appointments = [
    appointment('trustee-a'),
    appointment('trustee-b', {
      revokedOn: '2026-11-14', revocationEvidenceRef: 'revoke-b',
    }),
  ];
  const result = assess(appointments, ['trustee-a']);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'joint_requires_all_active_signers');
  assert.equal(result.activeTrusteeCount, 2);
  assert.equal(assess(appointments, ['trustee-a', 'trustee-b']).eligible, true);
});

test('revoked trustee cannot be used as a second signer after effective revocation', () => {
  const appointments = [
    appointment('trustee-a'),
    appointment('trustee-b', {
      revokedOn: '2026-11-13', revocationEvidenceRef: 'revoke-b',
    }),
  ];
  assert.equal(assess(appointments, ['trustee-a']).eligible, true);
  const result = assess(appointments, ['trustee-a', 'trustee-b']);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'signer_not_active');
  assert.equal(result.activeTrusteeCount, 1);
});
