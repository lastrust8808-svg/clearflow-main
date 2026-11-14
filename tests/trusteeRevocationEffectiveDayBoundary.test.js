import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

// Calendar-day policy tests only: not authentication, execution or signature evidence.
const trustee = (trusteeId, extra = {}) => ({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  trusteeId, effectiveOn: '2026-11-01', acceptedOn: '2026-11-02',
  acceptanceEvidenceRef: 'accept-' + trusteeId, ...extra,
});
const evaluate = (asOfDate, mode, appointments, signerIds) =>
  evaluateTrusteeSigningPolicy({
    tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
    asOfDate, mode, appointments, signerIds,
  });

test('revocation is exclusive at the beginning of its calendar date', () => {
  const a = trustee('trustee-a');
  const b = trustee('trustee-b', {
    revokedOn: '2026-11-13', revocationEvidenceRef: 'revoke-b',
  });
  assert.equal(evaluate('2026-11-12', 'joint', [a, b], ['trustee-a']).reason,
    'joint_requires_all_active_signers');
  assert.equal(evaluate('2026-11-12', 'joint', [a, b], ['trustee-a', 'trustee-b']).eligible, true);
  assert.equal(evaluate('2026-11-13', 'joint', [a, b], ['trustee-a']).eligible, true);
  assert.equal(evaluate('2026-11-13', 'joint', [a, b], ['trustee-a', 'trustee-b']).reason,
    'signer_not_active');
});

test('independent signer revoked today cannot sign even when another trustee is active', () => {
  const a = trustee('trustee-a');
  const b = trustee('trustee-b', {
    revokedOn: '2026-11-13', revocationEvidenceRef: 'revoke-b',
  });
  assert.equal(evaluate('2026-11-12', 'independent', [a, b], ['trustee-b']).eligible, true);
  const revoked = evaluate('2026-11-13', 'independent', [a, b], ['trustee-b']);
  assert.equal(revoked.eligible, false);
  assert.equal(revoked.reason, 'signer_not_active');
  assert.equal(evaluate('2026-11-13', 'independent', [a, b], ['trustee-a']).eligible, true);
});
