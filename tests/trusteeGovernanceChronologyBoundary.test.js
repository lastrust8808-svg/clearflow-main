import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

// Pure governance-snapshot boundary tests; not trustee authentication or signing.
const trustee = (overrides = {}) => ({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  trusteeId: 'trustee-a', effectiveOn: '2026-11-01',
  acceptedOn: '2026-11-02', acceptanceEvidenceRef: 'acceptance-a',
  ...overrides,
});
const assess = (asOfDate, appointments) => evaluateTrusteeSigningPolicy({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  asOfDate, mode: 'independent', appointments, signerIds: ['trustee-a'],
});

test('acceptance on the revocation date cannot revive a revoked trustee', () => {
  assert.throws(() => assess('2026-11-13', [trustee({
    acceptedOn: '2026-11-13', revokedOn: '2026-11-13',
    revocationEvidenceRef: 'revocation-a',
  })]), /acceptance must precede revocation/);
});

test('revocation before appointment effective date is invalid even if evaluated earlier', () => {
  assert.throws(() => assess('2026-11-02', [trustee({
    effectiveOn: '2026-11-20', revokedOn: '2026-11-19',
    revocationEvidenceRef: 'revocation-a',
  })]), /Revocation precedes appointment effective date/);
});

test('future effective date blocks signing despite an earlier valid acceptance', () => {
  const appointments = [trustee({
    effectiveOn: '2026-11-14', acceptedOn: '2026-11-02',
  })];
  assert.equal(assess('2026-11-13', appointments).reason, 'no_active_accepted_trustees');
  assert.equal(assess('2026-11-14', appointments).eligible, true);
});
