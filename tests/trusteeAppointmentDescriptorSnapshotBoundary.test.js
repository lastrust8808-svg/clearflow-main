import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

test('trustee appointment evaluation uses validated descriptors without Proxy get traps', () => {
  let getCount = 0;
  const appointment = new Proxy({
    trusteeId: 'trustee', tenantId: 'tenant', entityId: 'entity',
    trustId: 'trust', effectiveOn: '2026-01-01',
    acceptedOn: '2026-01-02', acceptanceEvidenceRef: 'acceptance-1',
  }, {
    get() {
      getCount++;
      throw new Error('untrusted appointment get trap executed');
    },
  });
  const result = evaluateTrusteeSigningPolicy({
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    asOfDate: '2026-11-21', mode: 'independent',
    appointments: [appointment], signerIds: ['trustee'],
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, 'eligible_under_supplied_policy');
  assert.equal(getCount, 0);
});
