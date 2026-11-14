import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

// Pure policy preflight only; no authentication, signing, or persistence.
const appointment = (overrides = {}) => ({
  trusteeId: 'trustee-a', tenantId: 'tenant-a', entityId: 'entity-a',
  trustId: 'trust-a', effectiveOn: '2024-02-29',
  acceptedOn: '2024-02-29', acceptanceEvidenceRef: 'acceptance-a',
  ...overrides,
});
const evaluate = (overrides = {}) => evaluateTrusteeSigningPolicy({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  asOfDate: '2024-02-29', mode: 'independent',
  appointments: [appointment()], signerIds: ['trustee-a'], ...overrides,
});

test('valid leap-day appointment can become active on the leap day', () => {
  assert.equal(evaluate().eligible, true);
  assert.equal(evaluate({ asOfDate: '2024-02-28' }).reason,
    'no_active_accepted_trustees');
});

test('invalid leap days are rejected in each governance date position', () => {
  assert.throws(() => evaluate({ asOfDate: '2025-02-29' }), /valid calendar date/);
  for (const field of ['effectiveOn', 'acceptedOn', 'revokedOn']) {
    assert.throws(() => evaluate({
      appointments: [appointment({
        [field]: '2025-02-29',
        ...(field === 'revokedOn' ? { revocationEvidenceRef: 'revocation-a' } : {}),
      })],
    }), /valid calendar date/, field);
  }
});

test('revocation on leap day is exclusive and cannot authorize signing', () => {
  assert.equal(evaluate({
    appointments: [appointment({
      effectiveOn: '2024-02-01', acceptedOn: '2024-02-02',
      revokedOn: '2024-02-29', revocationEvidenceRef: 'revocation-a',
    })],
  }).reason, 'no_active_accepted_trustees');
});
