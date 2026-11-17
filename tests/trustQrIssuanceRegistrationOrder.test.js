import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyTrustDocumentQrBytes } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant-issued-order', entityId: 'entity-issued-order', trustId: 'trust-issued-order' };
const documentId = 'document-issued-order';
const versionId = 'version-issued-order';
const tokenHashSha256 = createHash('sha256').update('issued-order-token').digest('hex');
const content = Buffer.from('%PDF-1.7\nfinalized version bytes');
const registeredAt = '2026-11-16T12:00:00.000Z';
const asOfAt = '2026-11-17T12:00:00.000Z';
const versionRegistry = {
  ...scope, documentId,
  versions: [{
    ...scope, documentId, versionId, sequence: 1,
    sha256: createHash('sha256').update(content).digest('hex'),
    status: 'active', evidenceRef: 'receipt-issued-order',
    registeredAt,
  }],
};
const lookup = { ...scope, tokenHashSha256, asOfAt };
function registry(issuedAt) {
  return { ...scope, bindings: [{
    ...scope, documentId, versionId, tokenHashSha256,
    status: 'active', issuedAt,
  }] };
}

test('QR verification refuses an active token issued before immutable document registration', () => {
  assert.throws(
    () => verifyTrustDocumentQrBytes(
      registry('2026-11-16T11:59:59.999Z'), lookup, versionRegistry, content,
    ),
    /QR binding issued before document version registration/,
  );
});

test('QR token issued at exact immutable registration instant may verify finalized bytes', () => {
  assert.deepEqual(
    verifyTrustDocumentQrBytes(registry(registeredAt), lookup, versionRegistry, content),
    { status: 'valid' },
  );
});

test('QR token issued after registration cannot verify altered finalized bytes', () => {
  assert.deepEqual(
    verifyTrustDocumentQrBytes(registry(asOfAt), lookup, versionRegistry, Buffer.from('altered')),
    { status: 'unknown' },
  );
});
