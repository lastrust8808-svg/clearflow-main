import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = Object.freeze({ tenantId: 'tenant', entityId: 'entity', trustId: 'trust' });
const issuedAt = '2026-11-01T00:00:00.000Z';
const revokedAt = '2026-11-02T00:00:00.000Z';
const asOfAt = '2026-11-03T00:00:00.000Z';
const revokedHash = 'a'.repeat(64);
const activeHash = 'b'.repeat(64);
const base = { ...scope, documentId: 'document', versionId: 'version' };

function lookup(tokenHashSha256, bindings) {
  return resolveTrustDocumentQrBinding(
    { ...scope, bindings },
    { ...scope, tokenHashSha256, asOfAt },
  );
}

test('QR registry never exposes revoked token binding, including when another version token is active', () => {
  const bindings = [
    { ...base, tokenHashSha256: revokedHash, status: 'revoked', issuedAt, revokedAt, revocationEvidenceRef: 'receipt' },
    { ...base, tokenHashSha256: activeHash, status: 'active', issuedAt: revokedAt },
  ];
  assert.deepEqual(lookup(revokedHash, bindings), { status: 'unknown' });
  assert.deepEqual(lookup(activeHash, bindings), { status: 'bound', documentId: 'document', versionId: 'version' });
  assert.deepEqual(lookup('c'.repeat(64), bindings), { status: 'unknown' });
});

test('QR registry rejects replacement before revocation even when requested token is unknown', () => {
  const bindings = [
    { ...base, tokenHashSha256: revokedHash, status: 'revoked', issuedAt, revokedAt, revocationEvidenceRef: 'receipt' },
    { ...base, tokenHashSha256: activeHash, status: 'active', issuedAt: '2026-11-01T23:59:59.999Z' },
  ];
  assert.throws(() => lookup('c'.repeat(64), bindings), /Overlapping QR bindings/);
});
