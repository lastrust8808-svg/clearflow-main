import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant', entityId: 'entity', trustId: 'trust' };
const instant = ms => new Date(Date.UTC(2026, 10, 17, 12, 0, 0, ms)).toISOString();
const row = (documentId, versionId, digit, issuedAt, revokedAt) => ({
  ...scope, documentId, versionId, tokenHashSha256: digit.repeat(64),
  status: revokedAt === undefined ? 'active' : 'revoked', issuedAt,
  ...(revokedAt === undefined ? {} : {
    revokedAt, revocationEvidenceRef: 'receipt-' + digit,
  }),
});

test('cross-document millisecond boundary accepts exact as-of issuance but rejects future sibling', () => {
  const t0 = instant(0), t1 = instant(1), t2 = instant(2);
  const first = row('doc-a', 'v1', 'a', t0, t1);
  const replacement = row('doc-a', 'v1', 'b', t1);
  const unrelated = row('doc-b', 'v1', 'c', t2);
  for (const bindings of [[first, replacement, unrelated], [unrelated, replacement, first]]) {
    const registry = { ...scope, bindings };
    for (const token of ['a', 'b', 'c', 'f']) {
      assert.throws(() => resolveTrustDocumentQrBinding(registry, {
        ...scope, tokenHashSha256: token.repeat(64), asOfAt: t1,
      }), /issued after lookup as-of timestamp/);
    }
    assert.deepEqual(resolveTrustDocumentQrBinding(registry, {
      ...scope, tokenHashSha256: 'b'.repeat(64), asOfAt: t2,
    }), { status: 'bound', documentId: 'doc-a', versionId: 'v1' });
    assert.deepEqual(resolveTrustDocumentQrBinding(registry, {
      ...scope, tokenHashSha256: 'c'.repeat(64), asOfAt: t2,
    }), { status: 'bound', documentId: 'doc-b', versionId: 'v1' });
  }
});
