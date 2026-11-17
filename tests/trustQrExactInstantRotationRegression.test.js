import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

// A revoked token may hand off to its replacement at the same trusted instant.
// A later historical lookup must not accidentally reanimate the retired token.
const scope = { tenantId: 'tenant-handoff', entityId: 'entity-handoff', trustId: 'trust-handoff' };
const oldHash = 'a'.repeat(64);
const newHash = 'b'.repeat(64);
const instant = '2026-11-17T10:00:00.000Z';
const old = { ...scope, documentId: 'document-handoff', versionId: 'version-handoff',
  tokenHashSha256: oldHash, status: 'revoked',
  issuedAt: '2026-11-16T10:00:00.000Z', revokedAt: instant,
  revocationEvidenceRef: 'receipt-handoff' };
const replacement = { ...scope, documentId: 'document-handoff', versionId: 'version-handoff',
  tokenHashSha256: newHash, status: 'active', issuedAt: instant };

test('exact-instant QR rotation admits only replacement regardless of row order', () => {
  for (const bindings of [[old, replacement], [replacement, old]]) {
    const registry = { ...scope, bindings };
    for (const asOfAt of [instant, '2026-11-17T10:00:00.001Z']) {
      const lookup = tokenHashSha256 => ({ ...scope, tokenHashSha256, asOfAt });
      assert.deepEqual(resolveTrustDocumentQrBinding(registry, lookup(oldHash)),
        { status: 'unknown' });
      assert.deepEqual(resolveTrustDocumentQrBinding(registry, lookup(newHash)),
        { status: 'bound', documentId: 'document-handoff', versionId: 'version-handoff' });
    }
  }
});

test('rotation rejects replacement one millisecond before revocation regardless of row order', () => {
  const premature = { ...replacement, issuedAt: '2026-11-17T09:59:59.999Z' };
  for (const bindings of [[old, premature], [premature, old]]) {
    assert.throws(() => resolveTrustDocumentQrBinding(
      { ...scope, bindings },
      { ...scope, tokenHashSha256: newHash, asOfAt: instant },
    ), /Overlapping QR bindings for document version/);
  }
});
