import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant', entityId: 'entity', trustId: 'trust' };
const at = day => `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`;
const binding = (documentId, digit, issued, revoked = null) => ({
  ...scope, documentId, versionId: 'shared-local-version',
  tokenHashSha256: digit.repeat(64),
  status: revoked === null ? 'active' : 'revoked',
  issuedAt: at(issued),
  ...(revoked === null ? {} : {
    revokedAt: at(revoked), revocationEvidenceRef: `receipt-${digit}`,
  }),
});

test('historical QR rotation remains isolated across documents sharing a local version ID', () => {
  const rows = [
    binding('document-one', 'a', 1, 5),
    binding('document-one', 'b', 5),
    binding('document-two', 'c', 2, 7),
    binding('document-two', 'd', 7),
  ];
  for (const bindings of [rows, [...rows].reverse()]) {
    for (const [digit, documentId] of [['b', 'document-one'], ['d', 'document-two']]) {
      assert.deepEqual(resolveTrustDocumentQrBinding(
        { ...scope, bindings },
        { ...scope, tokenHashSha256: digit.repeat(64), asOfAt: at(10) },
      ), { status: 'bound', documentId, versionId: 'shared-local-version' });
    }
    for (const digit of ['a', 'c', 'f']) {
      assert.deepEqual(resolveTrustDocumentQrBinding(
        { ...scope, bindings },
        { ...scope, tokenHashSha256: digit.repeat(64), asOfAt: at(10) },
      ), { status: 'unknown' });
    }
  }
});
