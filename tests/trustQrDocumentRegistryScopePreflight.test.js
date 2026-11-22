import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTrustDocumentQrBytes } from '../server/services/trustDocumentQrRegistryPolicy.js';

test('QR bytes rejects mismatched document registry before reading version history', () => {
  const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a' };
  const digest = 'a'.repeat(64);
  const issuedAt = '2026-11-20T12:00:00.000Z';
  const qrRegistry = { ...scope, bindings: [{
    ...scope, documentId: 'document-a', versionId: 'version-a',
    tokenHashSha256: digest, status: 'active', issuedAt,
  }] };
  const lookup = { ...scope, tokenHashSha256: digest,
    asOfAt: '2026-11-22T12:00:00.000Z' };
  let traversed = false;
  const versions = new Proxy([], {
    getPrototypeOf() { traversed = true; throw new Error('version traversal'); },
    ownKeys() { traversed = true; throw new Error('version traversal'); },
    getOwnPropertyDescriptor() { traversed = true; throw new Error('version traversal'); },
  });
  for (const changed of [
    { tenantId: 'tenant-other' }, { entityId: 'entity-other' },
    { trustId: 'trust-other' }, { documentId: 'document-other' },
  ]) {
    traversed = false;
    const registry = { ...scope, documentId: 'document-a', ...changed, versions };
    assert.throws(() => verifyTrustDocumentQrBytes(qrRegistry, lookup, registry, Buffer.alloc(0)),
      /QR document registry scope mismatch/);
    assert.equal(traversed, false);
  }
});
