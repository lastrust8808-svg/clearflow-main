import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTrustDocumentVersion } from '../server/services/trustDocumentVersionPolicy.js';

const digest = 'a'.repeat(64);
const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', documentId: 'document-a' };
function registry(versionId) {
  return { ...scope, versions: [{
    ...scope, versionId, sequence: 1, sha256: digest, status: 'current',
    registeredAt: '2026-11-20T12:00:00.000Z', evidenceRef: 'registration-a',
  }] };
}

test('supplementary Unicode version IDs remain valid across registry and proof', () => {
  const versionId = 'version-🚀';
  assert.deepEqual(verifyTrustDocumentVersion(registry(versionId), { versionId, sha256: digest }),
    { status: 'valid' });
});

test('unpaired UTF-16 surrogates are rejected in version identifiers', () => {
  for (const invalid of ['version-\\uD800', 'version-\\uDC00', 'version-\\uD800x']) {
    assert.throws(() => verifyTrustDocumentVersion(registry(invalid),
      { versionId: invalid, sha256: digest }), /well-formed Unicode/);
  }
});
