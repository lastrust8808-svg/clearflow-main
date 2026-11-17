import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

// Different documents may independently rotate QR tokens even if their local
// version identifiers coincide. Window identity is (documentId, versionId).
const scope = { tenantId: 'tenant', entityId: 'entity', trustId: 'trust' };
const at = day => `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`;
const binding = (documentId, digit, issued, revoked = null) => ({
  ...scope, documentId, versionId: 'version-one',
  tokenHashSha256: digit.repeat(64),
  status: revoked === null ? 'active' : 'revoked',
  issuedAt: at(issued),
  ...(revoked === null ? {} : {
    revokedAt: at(revoked), revocationEvidenceRef: `receipt-${digit}`,
  }),
});

test('QR rotation windows are independent across documents sharing a local version identifier', () => {
  const rows = [
    binding('document-one', 'a', 1, 10),
    binding('document-one', 'b', 10),
    binding('document-two', 'c', 2, 12),
    binding('document-two', 'd', 12),
  ];
  for (const bindings of [rows, [...rows].reverse()]) {
    for (const [digit, documentId] of [['b', 'document-one'], ['d', 'document-two']]) {
      assert.deepEqual(resolveTrustDocumentQrBinding(
        { ...scope, bindings },
        { ...scope, tokenHashSha256: digit.repeat(64), asOfAt: at(15) },
      ), { status: 'bound', documentId, versionId: 'version-one' });
    }
    for (const digit of ['a', 'c', 'f']) {
      assert.deepEqual(resolveTrustDocumentQrBinding(
        { ...scope, bindings },
        { ...scope, tokenHashSha256: digit.repeat(64), asOfAt: at(15) },
      ), { status: 'unknown' });
    }
  }
});
