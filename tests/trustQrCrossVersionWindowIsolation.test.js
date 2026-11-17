import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

// Pure registry contract tests. They do not authenticate tenant ownership or receipts.
const scope = { tenantId: 'tenant', entityId: 'entity', trustId: 'trust' };
const stamp = day => `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`;
const hash = digit => digit.repeat(64);
const row = (versionId, digit, issued, revoked = null) => ({
  ...scope, documentId: 'document', versionId, tokenHashSha256: hash(digit),
  status: revoked === null ? 'active' : 'revoked',
  issuedAt: stamp(issued),
  ...(revoked === null ? {} : {
    revokedAt: stamp(revoked), revocationEvidenceRef: `receipt-${digit}`,
  }),
});
const lookup = (bindings, digit) => resolveTrustDocumentQrBinding(
  { ...scope, bindings },
  { ...scope, tokenHashSha256: hash(digit), asOfAt: stamp(15) },
);

test('QR token validity windows are isolated by document version, independent of row order', () => {
  const rows = [
    row('version-one', 'a', 1, 10),
    row('version-one', 'b', 10),
    row('version-two', 'c', 2, 8),
    row('version-two', 'd', 8),
  ];
  // Concurrent token windows across different versions are valid, but
  // only the active token for each version can resolve.
  for (const bindings of [rows, [...rows].reverse()]) {
    assert.deepEqual(lookup(bindings, 'b'), {
      status: 'bound', documentId: 'document', versionId: 'version-one',
    });
    assert.deepEqual(lookup(bindings, 'd'), {
      status: 'bound', documentId: 'document', versionId: 'version-two',
    });
    for (const digit of ['a', 'c', 'f']) {
      assert.deepEqual(lookup(bindings, digit), { status: 'unknown' });
    }
  }
});

test('overlapping windows within one version reject the whole registry even when another version is queried', () => {
  const rows = [
    row('version-one', 'a', 1, 10),
    row('version-one', 'b', 9),
    row('version-two', 'c', 2),
  ];
  for (const bindings of [rows, [...rows].reverse()]) {
    for (const digit of ['a', 'b', 'c', 'f']) {
      assert.throws(() => lookup(bindings, digit), /Overlapping QR bindings/);
    }
  }
});
