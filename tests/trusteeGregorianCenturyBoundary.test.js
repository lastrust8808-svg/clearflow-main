import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrusteeSigningPolicy } from '../server/services/trusteeSigningPolicy.js';

// Gregorian century leap-year boundary, using supplied governance data only.
// This is not authenticated trustee authority or signature verification.
const assess = (asOfDate, effectiveOn, acceptedOn) =>
  evaluateTrusteeSigningPolicy({
    tenantId: 'tenant-century', entityId: 'entity-century', trustId: 'trust-century',
    asOfDate, mode: 'independent', signerIds: ['trustee-century'],
    appointments: [{
      trusteeId: 'trustee-century', tenantId: 'tenant-century',
      entityId: 'entity-century', trustId: 'trust-century',
      effectiveOn, acceptedOn, acceptanceEvidenceRef: 'receipt-century',
    }],
  });

test('Gregorian century years reject February 29 in 1900 and 2100', () => {
  for (const invalid of ['1900-02-29', '2100-02-29']) {
    assert.throws(() => assess(invalid, '1900-01-01', '1900-01-01'), /asOfDate/);
    assert.throws(() => assess('2100-03-01', invalid, '1900-01-01'), /appointment.effectiveOn/);
    assert.throws(() => assess('2100-03-01', '1900-01-01', invalid), /appointment.acceptedOn/);
  }
});

test('Gregorian divisible-by-400 year accepts February 29 and enforces signing activation', () => {
  assert.equal(assess('2000-02-28', '2000-02-29', '2000-02-29').eligible, false);
  const active = assess('2000-02-29', '2000-02-29', '2000-02-29');
  assert.equal(active.eligible, true);
  assert.equal(active.activeTrusteeCount, 1);
  assert.equal(assess('2000-03-01', '2000-02-29', '2000-02-29').eligible, true);
});
