import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

// Pure input hardening: does not authenticate trustees or evidence.
const snapshot = () => ({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  asOfDate: '2026-11-13', mode: 'independent',
  appointments: [{
    tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
    trusteeId: 'trustee-a', effectiveOn: '2026-11-01',
    acceptedOn: '2026-11-02', acceptanceEvidenceRef: 'accept-a',
  }],
  signerIds: ['trustee-a'],
});

test('rejects accessor-backed signer array without invoking getter', () => {
  const input = snapshot();
  let accessed = false;
  Object.defineProperty(input.signerIds, '0', {
    enumerable: true, configurable: true,
    get() { accessed = true; throw new Error('untrusted getter executed'); },
  });
  assert.throws(() => evaluateTrusteeSigningPolicy(input),
    /signerIds must contain enumerable data elements/);
  assert.equal(accessed, false);
});

test('rejects sparse appointment array instead of silently omitting trustee', () => {
  const input = snapshot();
  input.appointments.length = 2;
  assert.throws(() => evaluateTrusteeSigningPolicy(input),
    /appointments must not contain holes/);
});

test('rejects symbol claims on signer array without evaluating them', () => {
  const input = snapshot();
  const claim = Symbol('hidden-authority');
  Object.defineProperty(input.signerIds, claim, {
    enumerable: true, get() { throw new Error('hidden claim evaluated'); },
  });
  assert.throws(() => evaluateTrusteeSigningPolicy(input),
    /signerIds must contain only array indices/);
});
