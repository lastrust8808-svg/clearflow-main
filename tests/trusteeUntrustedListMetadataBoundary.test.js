import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

// Pure structural validation only; never establishes authenticated trustee authority.
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

test('rejects non-enumerable signer index instead of treating it as an authorized signer', () => {
  const input = snapshot();
  Object.defineProperty(input.signerIds, '0', {
    value: 'trustee-a', writable: true, configurable: true, enumerable: false,
  });
  assert.throws(() => evaluateTrusteeSigningPolicy(input),
    /signerIds must contain enumerable data elements/);
});

test('rejects named metadata on appointment array without evaluating accessor', () => {
  const input = snapshot();
  let evaluated = false;
  Object.defineProperty(input.appointments, 'overrideAuthority', {
    enumerable: false,
    get() { evaluated = true; throw new Error('untrusted metadata getter invoked'); },
  });
  assert.throws(() => evaluateTrusteeSigningPolicy(input),
    /appointments must contain only array indices/);
  assert.equal(evaluated, false);
});

test('rejects inherited array subclass metadata', () => {
  const input = snapshot();
  Object.setPrototypeOf(input.signerIds, Object.create(Array.prototype));
  assert.throws(() => evaluateTrusteeSigningPolicy(input),
    /signerIds must be a plain array/);
});
