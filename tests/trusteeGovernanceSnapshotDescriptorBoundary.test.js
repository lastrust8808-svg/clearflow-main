import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

test('governance snapshot uses own descriptors without executing Proxy get traps', () => {
  let getCount = 0;
  const snapshot = new Proxy({
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    asOfDate: '2026-11-21', mode: 'independent',
    appointments: [], signerIds: [],
  }, {
    get() {
      getCount++;
      throw new Error('hostile snapshot get trap must not execute');
    },
  });
  const result = evaluateTrusteeSigningPolicy(snapshot);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'no_active_accepted_trustees');
  assert.equal(getCount, 0);
});
