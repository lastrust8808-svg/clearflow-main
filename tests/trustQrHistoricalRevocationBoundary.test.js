import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolveTrustDocumentQrBinding, verifyTrustDocumentQrBytes } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant-historical', entityId: 'entity-historical', trustId: 'trust-historical' };
const registeredAt = '2026-10-28T12:00:00.000Z';
const revokedAt = '2026-10-29T12:00:00.000Z';
const content = Buffer.from('%PDF-1.7\nfinalized historical bytes');
const tokenHashSha256 = createHash('sha256').update('historical-test-token').digest('hex');
const registry = { ...scope, bindings: [{ ...scope, documentId: 'document-historical',
  versionId: 'version-historical', tokenHashSha256, status: 'active', issuedAt: registeredAt }] };
const version = { ...scope, documentId: 'document-historical', versionId: 'version-historical',
  sequence: 1, sha256: createHash('sha256').update(content).digest('hex'),
  status: 'revoked', evidenceRef: 'registration-receipt-historical',
  registeredAt, revokedAt, revocationEvidenceRef: 'revocation-receipt-historical' };
const versions = { ...scope, documentId: 'document-historical', versions: [version] };

test('historical QR lookup refuses future document revocation rather than retroactively applying it', () => {
  const lookup = { ...scope, tokenHashSha256, asOfAt: '2026-10-29T11:59:59.999Z' };
  assert.deepEqual(resolveTrustDocumentQrBinding(registry, lookup), {
    status: 'bound', documentId: 'document-historical', versionId: 'version-historical',
  });
  assert.throws(() => verifyTrustDocumentQrBytes(registry, lookup, versions, content),
    /revocation occurs after lookup as-of/);
});

test('QR verification returns revoked at the exact trusted revocation instant', () => {
  const lookup = { ...scope, tokenHashSha256, asOfAt: revokedAt };
  assert.deepEqual(verifyTrustDocumentQrBytes(registry, lookup, versions, content),
    { status: 'revoked' });
  assert.deepEqual(verifyTrustDocumentQrBytes(registry, lookup, versions,
    Buffer.from('tampered bytes')), { status: 'unknown' });
});

test('historical QR lookup rejects a later document registration rather than silently accepting a future version', () => {
  const lookup = { ...scope, tokenHashSha256, asOfAt: '2026-10-29T12:00:00.000Z' };
  const currentVersion = { ...version, status: 'active' };
  delete currentVersion.revokedAt;
  delete currentVersion.revocationEvidenceRef;
  const futureVersion = {
    ...currentVersion,
    versionId: 'version-future',
    sequence: 2,
    evidenceRef: 'registration-receipt-future',
    registeredAt: '2026-10-30T12:00:00.000Z',
  };
  const futureRegistry = { ...versions, versions: [currentVersion, futureVersion] };
  assert.throws(
    () => verifyTrustDocumentQrBytes(registry, lookup, futureRegistry, content),
    /registered after lookup as-of timestamp/,
  );
});
