import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createTrustDocumentQrLink, digestTrustDocumentQrLink } from '../server/services/trustDocumentQrPolicy.js';
import { resolveTrustDocumentQrBinding, verifyTrustDocumentQrBytes } from '../server/services/trustDocumentQrRegistryPolicy.js';

const origin = 'https://verify.example.org';
const issuedAt = '2026-10-28T12:00:00.000Z';
const revokedAt = '2026-10-29T12:00:00.000Z';
const scope = { tenantId: 'tenant-A', entityId: 'trust-A' };

function fixture() {
  const link = createTrustDocumentQrLink(origin);
  const binding = { ...scope, documentId: 'document-1', versionId: 'version-1',
    tokenHashSha256: link.tokenHashSha256, status: 'active', issuedAt };
  const registry = { ...scope, bindings: [binding] };
  const lookup = { ...scope, tokenHashSha256: digestTrustDocumentQrLink(link.url, origin) };
  return { link, binding, registry, lookup };
}

test('resolves only an authorized-scoped active digest to an internal version binding', () => {
  const { link, registry, lookup } = fixture();
  const result = resolveTrustDocumentQrBinding(registry, lookup);
  assert.deepEqual(result, { status: 'bound', documentId: 'document-1', versionId: 'version-1' });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(JSON.stringify(registry).includes(link.url), false);
  assert.equal(JSON.stringify(registry).includes(link.url.split('/').at(-1)), false);
});

test('revoked and unrecognized tokens are indistinguishable to the resolver', () => {
  const { registry, lookup } = fixture();
  const revoked = { ...registry, bindings: [{ ...registry.bindings[0], status: 'revoked',
    revokedAt, revocationEvidenceRef: 'revocation-evidence-1' }] };
  const unknown = { ...lookup, tokenHashSha256: 'f'.repeat(64) };
  assert.deepEqual(resolveTrustDocumentQrBinding(revoked, lookup), { status: 'unknown' });
  assert.deepEqual(resolveTrustDocumentQrBinding(registry, unknown), { status: 'unknown' });
  assert.equal(Object.isFrozen(resolveTrustDocumentQrBinding(registry, unknown)), true);
});

test('rejects cross-tenant and cross-entity lookup and registry rows', () => {
  const { registry, lookup } = fixture();
  for (const key of ['tenantId', 'entityId']) {
    assert.throws(() => resolveTrustDocumentQrBinding(registry, { ...lookup, [key]: 'other' }),
      /scope mismatch/);
    assert.throws(() => resolveTrustDocumentQrBinding({ ...registry,
      bindings: [{ ...registry.bindings[0], [key]: 'other' }] }, lookup), /scope mismatch/);
  }
});

test('rejects duplicate token hashes and duplicate active bindings for one version', () => {
  const { registry, lookup } = fixture();
  const original = registry.bindings[0];
  const second = createTrustDocumentQrLink(origin);
  assert.throws(() => resolveTrustDocumentQrBinding({ ...registry, bindings: [
    original, { ...original, documentId: 'document-2' }] }, lookup), /Duplicate QR token hash/);
  assert.throws(() => resolveTrustDocumentQrBinding({ ...registry, bindings: [
    original, { ...original, tokenHashSha256: second.tokenHashSha256 }] }, lookup),
  /Duplicate active QR document version/);
});

test('permits revoked token rotation with one new active binding', () => {
  const { registry, lookup } = fixture();
  const rotated = createTrustDocumentQrLink(origin);
  const original = registry.bindings[0];
  const rows = [
    { ...original, status: 'revoked', revokedAt, revocationEvidenceRef: 'revoke-1' },
    { ...original, tokenHashSha256: rotated.tokenHashSha256, issuedAt: revokedAt },
  ];
  const rotatedRegistry = { ...registry, bindings: rows };
  assert.deepEqual(resolveTrustDocumentQrBinding(rotatedRegistry, lookup), { status: 'unknown' });
  assert.deepEqual(resolveTrustDocumentQrBinding(rotatedRegistry, { ...lookup,
    tokenHashSha256: rotated.tokenHashSha256 }),
  { status: 'bound', documentId: 'document-1', versionId: 'version-1' });
});

test('fails closed on malformed hashes, statuses, timestamps and revocation evidence', () => {
  const { registry, lookup } = fixture();
  const original = registry.bindings[0];
  const bad = [
    { tokenHashSha256: 'not-a-digest' },
    { tokenHashSha256: 'F'.repeat(64) },
    { status: 'expired' },
    { issuedAt: '2026-02-30T12:00:00.000Z' },
    { status: 'revoked' },
    { status: 'revoked', revokedAt: issuedAt, revocationEvidenceRef: 'revoke-1' },
    { status: 'revoked', revokedAt, revocationEvidenceRef: '' },
    { revokedAt },
    { revocationEvidenceRef: 'revoke-1' },
    { documentId: 'doc' + String.fromCharCode(0) + 'hidden' },
  ];
  for (const change of bad) {
    assert.throws(() => resolveTrustDocumentQrBinding({ ...registry,
      bindings: [{ ...original, ...change }] }, lookup));
  }
  assert.throws(() => resolveTrustDocumentQrBinding(registry, { ...lookup,
    tokenHashSha256: 'x'.repeat(64) }), /SHA-256/);
  assert.throws(() => resolveTrustDocumentQrBinding({ ...registry, bindings: [null] }, lookup),
    /Invalid QR binding/);
});

const finalizedBytes = Buffer.from('%PDF-1.7\\nimmutable finalized document bytes');
const finalizedDigest = createHash('sha256').update(finalizedBytes).digest('hex');
function versionRegistry(overrides = {}) {
  return { ...scope, documentId: 'document-1', versions: [{
    ...scope, documentId: 'document-1', versionId: 'version-1', sequence: 1,
    sha256: finalizedDigest, status: 'current', evidenceRef: 'registered-1',
    registeredAt: issuedAt,
  }], ...overrides };
}

test('QR digest resolves to authorized document version only after actual byte verification', () => {
  const { registry, lookup } = fixture();
  const result = verifyTrustDocumentQrBytes(registry, lookup, versionRegistry(), finalizedBytes);
  assert.deepEqual(result, { status: 'valid' });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Object.keys(result), ['status']);
  assert.deepEqual(verifyTrustDocumentQrBytes(registry, lookup, versionRegistry(),
    Buffer.from('%PDF-1.7\\naltered')), { status: 'unknown' });
});

test('revoked and unknown QR tokens never disclose document version status', () => {
  const { registry, lookup } = fixture();
  const revoked = { ...registry, bindings: [{ ...registry.bindings[0], status: 'revoked',
    revokedAt, revocationEvidenceRef: 'revoke-1' }] };
  const unknown = { ...lookup, tokenHashSha256: 'f'.repeat(64) };
  const versions = versionRegistry({ versions: [{ ...versionRegistry().versions[0], status: 'revoked' }] });
  assert.deepEqual(verifyTrustDocumentQrBytes(revoked, lookup, versions, finalizedBytes),
    { status: 'unknown' });
  assert.deepEqual(verifyTrustDocumentQrBytes(registry, unknown, versions, finalizedBytes),
    { status: 'unknown' });
});

test('QR verification preserves superseded and revoked status for matching bytes', () => {
  const { registry, lookup } = fixture();
  const first = { ...versionRegistry().versions[0], status: 'superseded' };
  const next = { ...first, versionId: 'version-2', sequence: 2,
    sha256: createHash('sha256').update('new version').digest('hex'),
    status: 'current', evidenceRef: 'registered-2', registeredAt: revokedAt };
  assert.deepEqual(verifyTrustDocumentQrBytes(registry, lookup,
    versionRegistry({ versions: [first, next] }), finalizedBytes), { status: 'superseded' });
  assert.deepEqual(verifyTrustDocumentQrBytes(registry, lookup,
    versionRegistry({ versions: [{ ...first, status: 'revoked' }] }), finalizedBytes),
  { status: 'revoked' });
});

test('QR byte verification rejects registry scope substitution and invalid bytes', () => {
  const { registry, lookup } = fixture();
  for (const key of ['tenantId', 'entityId', 'documentId']) {
    assert.throws(() => verifyTrustDocumentQrBytes(registry, lookup,
      versionRegistry({ [key]: 'other' }), finalizedBytes), /scope mismatch/);
  }
  assert.throws(() => verifyTrustDocumentQrBytes(registry, lookup, versionRegistry(), ''),
    /bytes required/);
  assert.throws(() => verifyTrustDocumentQrBytes(registry, lookup,
    versionRegistry({ versions: [{ ...versionRegistry().versions[0], tenantId: 'other' }] }),
    finalizedBytes), /scope mismatch/);
  assert.deepEqual(verifyTrustDocumentQrBytes(registry, lookup,
    versionRegistry({ versions: [{ ...versionRegistry().versions[0], versionId: 'other' }] }),
    finalizedBytes), { status: 'unknown' });
});
