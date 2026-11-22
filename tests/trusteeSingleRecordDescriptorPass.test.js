import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a' };
const appointment = { ...scope, trusteeId: 'trustee-a', effectiveOn: '2026-11-01',
  acceptedOn: '2026-11-02', acceptanceEvidenceRef: 'evidence-a' };
const snapshot = { ...scope, asOfDate: '2026-11-13', mode: 'independent',
  appointments: [appointment], signerIds: ['trustee-a'] };

function changingDescriptors(target, key, replacement) {
  let reads = 0;
  return { proxy: new Proxy(target, {
    getOwnPropertyDescriptor(object, property) {
      if (property === key) {
        reads++;
        const descriptor = Reflect.getOwnPropertyDescriptor(object, property);
        return { ...descriptor, value: reads === 1 ? descriptor.value : replacement };
      }
      return Reflect.getOwnPropertyDescriptor(object, property);
    },
  }), reads: () => reads };
}

test('governance snapshot uses first validated descriptor without second authority read', () => {
  const altered = changingDescriptors({ ...snapshot }, 'signerIds', ['intruder']);
  const result = evaluateTrusteeSigningPolicy(altered.proxy);
  assert.equal(result.eligible, true);
  assert.equal(altered.reads(), 1);
});

test('trustee appointment uses first validated descriptor without second identity read', () => {
  const altered = changingDescriptors({ ...appointment }, 'trusteeId', 'intruder');
  const result = evaluateTrusteeSigningPolicy({
    ...snapshot, appointments: [altered.proxy],
  });
  assert.equal(result.eligible, true);
  assert.equal(altered.reads(), 1);
});
