import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyTrustDocumentQrBytes } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant-calendar', entityId: 'entity-calendar', trustId: 'trust-calendar' };
const bytes = Buffer.from('immutable finalized bytes');
const documentId = 'document-calendar';
const versionId = 'version-calendar';
const tokenHashSha256 = createHash('sha256').update('calendar-token').digest('hex');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const asOfAt = '2028-03-01T00:00:00.000Z';
const lookup = { ...scope, tokenHashSha256, asOfAt };
const qrRegistry = { ...scope, bindings: [{
  ...scope, documentId, versionId, tokenHashSha256,
  status: 'active', issuedAt: '2028-02-29T12:00:00.000Z',
}] };

function versionRegistry(registeredAt) {
  return { ...scope, documentId, versions: [{
    ...scope, documentId, versionId, sequence: 1, sha256,
    status: 'current', evidenceRef: 'calendar-registration-receipt', registeredAt,
  }] };
}

test('QR verification rejects impossible immutable registration calendar dates', () => {
  for (const invalid of [
    '2027-02-29T00:00:00.000Z',
    '2100-02-29T00:00:00.000Z',
    '2028-02-30T00:00:00.000Z',
  ]) {
    assert.throws(
      () => verifyTrustDocumentQrBytes(qrRegistry, lookup, versionRegistry(invalid), bytes),
      /version\.registeredAt must be a canonical UTC timestamp/,
      invalid,
    );
  }
});

test('QR verification accepts a real leap-day registration at token issuance', () => {
  assert.deepEqual(
    verifyTrustDocumentQrBytes(
      qrRegistry, lookup, versionRegistry('2028-02-29T12:00:00.000Z'), bytes,
    ),
    { status: 'valid' },
  );
});
