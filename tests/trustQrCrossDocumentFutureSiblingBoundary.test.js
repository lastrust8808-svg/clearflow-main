import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant', entityId: 'entity', trustId: 'trust' };
const at = day => `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`;
const row = (documentId, token, issuedAt, revokedAt) => ({
  ...scope, documentId, versionId: 'v1',
  tokenHashSha256: token.repeat(64),
  status: revokedAt ? 'revoked' : 'active',
  issuedAt: at(issuedAt),
  ...(revokedAt ? { revokedAt: at(revokedAt), revocationEvidenceRef: `receipt-${token}` } : {}),
});

test('independent document rotations reject a future sibling even for an otherwise valid earlier token', () => {
  const rows = [
    row('doc-one', 'a', 1, 5),
    row('doc-one', 'b', 5),
    row('doc-two', 'c', 2, 8),
    row('doc-two', 'd', 8),
  ];
  for (const bindings of [rows, [...rows].reverse()]) {
    const registry = { ...scope, bindings };
    for (const token of ['a', 'b', 'c', 'd', 'f']) {
      assert.throws(
        () => resolveTrustDocumentQrBinding(registry, {
          ...scope, tokenHashSha256: token.repeat(64), asOfAt: at(7),
        }),
        /issued after lookup as-of timestamp/,
        `future issuance must reject lookup for ${token}`,
      );
    }
    assert.deepEqual(
      resolveTrustDocumentQrBinding(registry, {
        ...scope, tokenHashSha256: 'b'.repeat(64), asOfAt: at(9),
      }),
      { status: 'bound', documentId: 'doc-one', versionId: 'v1' },
    );
  }
});
