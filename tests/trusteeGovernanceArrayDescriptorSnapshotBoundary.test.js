import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

test('validated trustee and signer arrays never invoke Proxy get traps', () => {
  let reads = 0;
  const guarded = values => new Proxy(values, {
    get() {
      reads++;
      throw new Error('untrusted governance array get trap executed');
    },
  });
  const result = evaluateTrusteeSigningPolicy({
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    asOfDate: '2026-11-21', mode: 'independent',
    appointments: guarded([{
      trusteeId: 'trustee', tenantId: 'tenant', entityId: 'entity',
      trustId: 'trust', effectiveOn: '2026-01-01',
      acceptedOn: '2026-01-02', acceptanceEvidenceRef: 'acceptance-1',
    }]),
    signerIds: guarded(['trustee']),
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, 'eligible_under_supplied_policy');
  assert.equal(reads, 0);
});
