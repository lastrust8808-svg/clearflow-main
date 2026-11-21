import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant-binding-calendar', entityId: 'entity-binding-calendar', trustId: 'trust-binding-calendar' };
const tokenHashSha256 = createHash('sha256').update('binding-calendar-token').digest('hex');
const unknownHash = createHash('sha256').update('unknown-binding-calendar-token').digest('hex');
const lookup = { ...scope, tokenHashSha256: unknownHash, asOfAt: '2101-01-01T00:00:00.000Z' };

function registry(issuedAt, revokedAt) {
  return { ...scope, bindings: [{
    ...scope, documentId: 'document-binding-calendar', versionId: 'version-binding-calendar',
    tokenHashSha256, status: revokedAt === undefined ? 'active' : 'revoked',
    issuedAt,
    ...(revokedAt === undefined ? {} : { revokedAt, revocationEvidenceRef: 'receipt-binding-calendar' }),
  }] };
}

test('QR binding registry rejects impossible issuance dates even for unknown lookups', () => {
  for (const invalid of ['2027-02-29T00:00:00.000Z', '2100-02-29T00:00:00.000Z', '2028-02-30T00:00:00.000Z']) {
    assert.throws(() => resolveTrustDocumentQrBinding(registry(invalid), lookup),
      /binding\.issuedAt must be a canonical UTC timestamp/, invalid);
  }
});

test('QR binding registry rejects impossible revocation dates even for unknown lookups', () => {
  for (const invalid of ['2027-02-29T00:00:00.000Z', '2100-02-29T00:00:00.000Z', '2028-02-30T00:00:00.000Z']) {
    assert.throws(() => resolveTrustDocumentQrBinding(registry('2000-02-29T00:00:00.000Z', invalid), lookup),
      /binding\.revokedAt must be a canonical UTC timestamp/, invalid);
  }
});

test('QR binding registry accepts actual leap dates and revocation chronology', () => {
  assert.deepEqual(resolveTrustDocumentQrBinding(
    registry('2000-02-29T00:00:00.000Z', '2028-02-29T00:00:00.000Z'), lookup,
  ), { status: 'unknown' });
});
