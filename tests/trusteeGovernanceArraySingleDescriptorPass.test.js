import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

test('trustee and signer arrays use first validated descriptor snapshot only', () => {
  const reads = { appointments: 0, signers: 0 };
  const shifting = (values, key, replacement) => new Proxy(values, {
    get() {
      throw new Error('untrusted array get trap must not run');
    },
    getOwnPropertyDescriptor(target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      if (property !== '0') return descriptor;
      reads[key]++;
      return { ...descriptor, value: reads[key] === 1 ? descriptor.value : replacement };
    },
  });
  const appointment = {
    trusteeId: 'trustee', tenantId: 'tenant', entityId: 'entity',
    trustId: 'trust', effectiveOn: '2026-01-01',
    acceptedOn: '2026-01-02', acceptanceEvidenceRef: 'acceptance-1',
  };
  const result = evaluateTrusteeSigningPolicy({
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    asOfDate: '2026-11-21', mode: 'independent',
    appointments: shifting([appointment], 'appointments', { ...appointment, trusteeId: 'substituted' }),
    signerIds: shifting(['trustee'], 'signers', 'substituted'),
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, 'eligible_under_supplied_policy');
  assert.deepEqual(reads, { appointments: 1, signers: 1 });
});
