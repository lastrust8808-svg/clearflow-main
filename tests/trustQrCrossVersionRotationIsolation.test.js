import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant', entityId: 'entity', trustId: 'trust' };
const at = day => `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`;
const row = (versionId, digit, issued, revoked = null) => ({
  ...scope, documentId: 'document', versionId,
  tokenHashSha256: digit.repeat(64),
  status: revoked === null ? 'active' : 'revoked',
  issuedAt: at(issued),
  ...(revoked === null ? {} : {
    revokedAt: at(revoked), revocationEvidenceRef: `receipt-${digit}`,
  }),
});

test('QR rotation windows are independent for distinct versions of one document', () => {
  const rows = [
    row('version-one', 'a', 1, 10),
    row('version-one', 'b', 10),
    row('version-two', 'c', 2, 12),
    row('version-two', 'd', 12),
  ];
  for (const bindings of [rows, [...rows].reverse()]) {
    for (const [digit, versionId] of [['b', 'version-one'], ['d', 'version-two']]) {
      assert.deepEqual(resolveTrustDocumentQrBinding(
        { ...scope, bindings },
        { ...scope, tokenHashSha256: digit.repeat(64), asOfAt: at(15) },
      ), { status: 'bound', documentId: 'document', versionId });
    }
    for (const digit of ['a', 'c', 'f']) {
      assert.deepEqual(resolveTrustDocumentQrBinding(
        { ...scope, bindings },
        { ...scope, tokenHashSha256: digit.repeat(64), asOfAt: at(15) },
      ), { status: 'unknown' });
    }
  }
});
