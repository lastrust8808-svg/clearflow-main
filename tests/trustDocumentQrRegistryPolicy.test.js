import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createTrustDocumentQrLink, digestTrustDocumentQrLink } from '../server/services/trustDocumentQrPolicy.js';
import { resolveTrustDocumentQrBinding, verifyTrustDocumentQrBytes } from '../server/services/trustDocumentQrRegistryPolicy.js';

const origin = 'https://verify.example.org';
const issuedAt = '2026-10-28T12:00:00.000Z';
const revokedAt = '2026-10-29T12:00:00.000Z';
const scope = { tenantId: 'tenant-A', entityId: 'entity-A', trustId: 'trust-A' };

function fixture() {
  const link = createTrustDocumentQrLink(origin);
  const binding = { ...scope, documentId: 'document-1', versionId: 'version-1',
    tokenHashSha256: link.tokenHashSha256, status: 'active', issuedAt };
  const registry = { ...scope, bindings: [binding] };
  const lookup = { ...scope, asOfAt: '2026-10-30T12:00:00.000Z',
    tokenHashSha256: digestTrustDocumentQrLink(link.url, origin) };
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

test('rejects cross-tenant, cross-entity and cross-trust lookup and registry rows', () => {
  const { registry, lookup } = fixture();
  for (const key of ['tenantId', 'entityId', 'trustId']) {
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

test('QR revocation evidence cannot be replayed for multiple token revocations', () => {
  const { registry, lookup } = fixture();
  const original = registry.bindings[0];
  const replacement = createTrustDocumentQrLink(origin);
  const first = {
    ...original, status: 'revoked', revokedAt,
    revocationEvidenceRef: 'revocation-receipt-1',
  };
  const second = {
    ...original, tokenHashSha256: replacement.tokenHashSha256,
    issuedAt: revokedAt, status: 'revoked',
    revokedAt: '2026-10-30T11:00:00.000Z',
    revocationEvidenceRef: 'revocation-receipt-1',
  };
  // Even non-overlapping validity windows require independent revocation
  // provenance. Registry row order must not affect replay detection.
  for (const bindings of [[first, second], [second, first]]) {
    assert.throws(() => resolveTrustDocumentQrBinding({
      ...registry, bindings,
    }, lookup), /Duplicate QR revocation evidence reference/);
  }
  // A receipt cannot be reused for an unrelated document either.
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: [first, { ...second, documentId: 'document-2' }],
  }, lookup), /Duplicate QR revocation evidence reference/);
  // Distinct evidence references preserve legitimate completed rotations.
  assert.deepEqual(resolveTrustDocumentQrBinding({
    ...registry, bindings: [first, {
      ...second, revocationEvidenceRef: 'revocation-receipt-2',
    }],
  }, lookup), { status: 'unknown' });
});

test('QR token rotations cannot overlap validity windows for the same document version', () => {
  const { registry, lookup } = fixture();
  const original = registry.bindings[0];
  const replacement = createTrustDocumentQrLink(origin);
  const revokedOriginal = {
    ...original, status: 'revoked', revokedAt,
    revocationEvidenceRef: 'revocation-1',
  };
  const replacementRow = {
    ...original, tokenHashSha256: replacement.tokenHashSha256,
  };
  // The new token must not become valid while the old one remains valid.
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: [revokedOriginal, {
      ...replacementRow, issuedAt: '2026-10-29T11:59:59.999Z',
    }],
  }, lookup), /Overlapping QR bindings/);
  // Reversed registry order must not bypass the check.
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: [{
      ...replacementRow, issuedAt: '2026-10-29T11:59:59.999Z',
    }, revokedOriginal],
  }, lookup), /Overlapping QR bindings/);
  // A revocation and replacement at the exact same instant are allowed.
  assert.deepEqual(resolveTrustDocumentQrBinding({
    ...registry, bindings: [revokedOriginal, {
      ...replacementRow, issuedAt: revokedAt,
    }],
  }, { ...lookup, tokenHashSha256: replacement.tokenHashSha256 }), {
    status: 'bound', documentId: 'document-1', versionId: 'version-1',
  });
  // Overlap between two already-revoked tokens is also invalid.
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: [revokedOriginal, {
      ...replacementRow, status: 'revoked',
      issuedAt: '2026-10-29T11:59:59.999Z',
      revokedAt: '2026-10-30T11:00:00.000Z',
      revocationEvidenceRef: 'revocation-2',
    }],
  }, lookup), /Overlapping QR bindings/);
});

test('large reverse-ordered QR rotation histories validate adjacent intervals without losing overlap checks', () => {
  const { registry, lookup } = fixture();
  const start = Date.parse('2026-10-28T00:00:00.000Z');
  const rows = Array.from({ length: 256 }, (_, index) => {
    const issued = new Date(start + index * 60_000).toISOString();
    const hash = createHash('sha256').update('rotation-' + index).digest('hex');
    return {
      ...registry.bindings[0], tokenHashSha256: hash, issuedAt: issued,
      ...(index === 255 ? { status: 'active' } : {
        status: 'revoked',
        revokedAt: new Date(start + (index + 1) * 60_000).toISOString(),
        revocationEvidenceRef: 'rotation-revocation-' + index,
      }),
    };
  });
  const reversed = { ...registry, bindings: [...rows].reverse() };
  assert.deepEqual(resolveTrustDocumentQrBinding(reversed, {
    ...lookup, tokenHashSha256: rows[255].tokenHashSha256,
  }), { status: 'bound', documentId: 'document-1', versionId: 'version-1' });
  assert.deepEqual(resolveTrustDocumentQrBinding(reversed, {
    ...lookup, tokenHashSha256: rows[0].tokenHashSha256,
  }), { status: 'unknown' });
  // One millisecond of overlap between two nonadjacent registry rows must
  // still fail after sorting; exact revocation/issuance boundaries are valid.
  const overlapping = [...rows];
  overlapping[127] = { ...overlapping[127],
    revokedAt: new Date(start + 129 * 60_000).toISOString() };
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: overlapping.reverse(),
  }, lookup), /Overlapping QR bindings/);
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
    /QR binding must be a plain data record/);
});

test('QR resolution requires canonical as-of time and rejects future-issued bindings', () => {
  const { registry, lookup } = fixture();
  for (const invalid of [undefined, null, '', '2026-10-30', '2026-02-30T12:00:00.000Z']) {
    assert.throws(() => resolveTrustDocumentQrBinding(registry, { ...lookup, asOfAt: invalid }),
      /lookup.asOfAt/);
  }
  assert.throws(() => resolveTrustDocumentQrBinding(registry, {
    ...lookup, asOfAt: '2026-10-28T11:59:59.999Z',
  }), /issued after lookup as-of/);
  assert.deepEqual(resolveTrustDocumentQrBinding(registry, {
    ...lookup, asOfAt: issuedAt,
  }), { status: 'bound', documentId: 'document-1', versionId: 'version-1' });
});

test('QR lookup cannot apply a revocation recorded after the requested as-of time', () => {
  const { registry, lookup } = fixture();
  const revoked = { ...registry, bindings: [{
    ...registry.bindings[0], status: 'revoked', revokedAt,
    revocationEvidenceRef: 'revoke-1',
  }] };
  assert.throws(() => resolveTrustDocumentQrBinding(revoked, {
    ...lookup, asOfAt: '2026-10-29T11:59:59.999Z',
  }), /revocation occurs after lookup as-of/);
  assert.deepEqual(resolveTrustDocumentQrBinding(revoked, {
    ...lookup, asOfAt: revokedAt,
  }), { status: 'unknown' });
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

test('QR issuance cannot predate registration of its finalized document version', () => {
  const { registry, lookup } = fixture();
  const registeredLater = versionRegistry({
    versions: [{
      ...versionRegistry().versions[0],
      registeredAt: '2026-10-28T12:00:00.001Z',
    }],
  });
  assert.throws(() => verifyTrustDocumentQrBytes(
    registry, lookup, registeredLater, finalizedBytes,
  ), /QR binding issued before document version registration/);

  // Exact same millisecond is permitted for an atomic registration/binding,
  // as is issuing a new token after a previously registered version.
  assert.deepEqual(verifyTrustDocumentQrBytes(
    registry, lookup, versionRegistry(), finalizedBytes,
  ), { status: 'valid' });
  const issuedLater = { ...registry, bindings: [{
    ...registry.bindings[0], issuedAt: '2026-10-28T12:00:00.001Z',
  }] };
  assert.deepEqual(verifyTrustDocumentQrBytes(
    issuedLater, lookup, versionRegistry(), finalizedBytes,
  ), { status: 'valid' });
});

test('QR byte verification rejects document versions registered after historical lookup time', () => {
  const { registry, lookup } = fixture();
  const historicalLookup = { ...lookup, asOfAt: issuedAt };
  const first = { ...versionRegistry().versions[0], status: 'superseded' };
  const later = { ...first, versionId: 'version-2', sequence: 2,
    sha256: createHash('sha256').update('later document').digest('hex'),
    status: 'current', evidenceRef: 'registered-2', registeredAt: revokedAt };
  assert.throws(() => verifyTrustDocumentQrBytes(registry, historicalLookup,
    versionRegistry({ versions: [first, later] }), finalizedBytes),
  /version registered after lookup as-of/);
  assert.deepEqual(verifyTrustDocumentQrBytes(registry,
    { ...lookup, asOfAt: revokedAt },
    versionRegistry({ versions: [first, later] }), finalizedBytes),
  { status: 'superseded' });
  assert.deepEqual(verifyTrustDocumentQrBytes(registry, historicalLookup,
    versionRegistry(), finalizedBytes), { status: 'valid' });
});

test('revoked and unknown QR tokens never disclose document version status', () => {
  const { registry, lookup } = fixture();
  const revoked = { ...registry, bindings: [{ ...registry.bindings[0], status: 'revoked',
    revokedAt, revocationEvidenceRef: 'revoke-1' }] };
  const unknown = { ...lookup, tokenHashSha256: 'f'.repeat(64) };
  const versions = versionRegistry({ versions: [{ ...versionRegistry().versions[0], status: 'revoked',
    revocationEvidenceRef: 'version-revocation-1' }] });
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
    versionRegistry({ versions: [{ ...first, status: 'revoked',
      revokedAt, revocationEvidenceRef: 'version-revocation-1' }] }), finalizedBytes),
  { status: 'revoked' });
});

test('QR byte verification rejects registry scope substitution and invalid bytes', () => {
  const { registry, lookup } = fixture();
  for (const key of ['tenantId', 'entityId', 'trustId', 'documentId']) {
    assert.throws(() => verifyTrustDocumentQrBytes(registry, lookup,
      versionRegistry({ [key]: 'other' }), finalizedBytes), /scope mismatch/);
  }
  assert.throws(() => verifyTrustDocumentQrBytes(registry, lookup, versionRegistry(), ''),
    /bytes required/);
  for (const key of ['tenantId', 'entityId', 'trustId']) {
    assert.throws(() => verifyTrustDocumentQrBytes(registry, lookup,
      versionRegistry({ versions: [{ ...versionRegistry().versions[0], [key]: 'other' }] }),
      finalizedBytes), /scope mismatch/);
  }
  assert.deepEqual(verifyTrustDocumentQrBytes(registry, lookup,
    versionRegistry({ versions: [{ ...versionRegistry().versions[0], versionId: 'other' }] }),
    finalizedBytes), { status: 'unknown' });
});


test('QR trust scope is mandatory even within the same tenant and entity', () => {
  const { registry, lookup } = fixture();
  assert.throws(() => resolveTrustDocumentQrBinding({ ...registry, trustId: undefined }, lookup),
    /registry.trustId/);
  assert.throws(() => resolveTrustDocumentQrBinding(registry, { ...lookup, trustId: undefined }),
    /lookup.trustId/);
  assert.throws(() => resolveTrustDocumentQrBinding({ ...registry,
    bindings: [{ ...registry.bindings[0], trustId: undefined }] }, lookup), /scope mismatch/);
  assert.throws(() => verifyTrustDocumentQrBytes(registry, lookup,
    versionRegistry({ trustId: undefined }), finalizedBytes), /scope mismatch/);
  assert.throws(() => verifyTrustDocumentQrBytes(registry, lookup,
    versionRegistry({ versions: [{ ...versionRegistry().versions[0], trustId: undefined }] }),
    finalizedBytes), /scope mismatch/);
  assert.deepEqual(verifyTrustDocumentQrBytes(registry, lookup, versionRegistry(), finalizedBytes),
    { status: 'valid' });
});

test('QR historical verification rejects future, malformed and pre-registration document revocations', () => {
  const { registry, lookup } = fixture();
  const base = versionRegistry().versions[0];
  const revokedVersion = changes => versionRegistry({ versions: [{
    ...base, status: 'revoked', revocationEvidenceRef: 'document-revocation-1',
    revokedAt, ...changes,
  }] });
  const asOf = '2026-10-29T11:59:59.999Z';
  assert.throws(() => verifyTrustDocumentQrBytes(
    registry, { ...lookup, asOfAt: asOf }, revokedVersion(), finalizedBytes,
  ), /revocation occurs after lookup as-of/);
  assert.throws(() => verifyTrustDocumentQrBytes(
    registry, lookup, revokedVersion({ revokedAt: undefined }), finalizedBytes,
  ), /version.revokedAt.*canonical/);
  assert.throws(() => verifyTrustDocumentQrBytes(
    registry, lookup, revokedVersion({ revokedAt: '2026-02-30T12:00:00.000Z' }), finalizedBytes,
  ), /version.revokedAt.*canonical/);
  assert.throws(() => verifyTrustDocumentQrBytes(
    registry, lookup, revokedVersion({ revokedAt: issuedAt }), finalizedBytes,
  ), /revocation must follow registration/);
  assert.deepEqual(verifyTrustDocumentQrBytes(
    registry, { ...lookup, asOfAt: revokedAt }, revokedVersion(), finalizedBytes,
  ), { status: 'revoked' });
  assert.throws(() => verifyTrustDocumentQrBytes(
    registry, lookup, versionRegistry({ versions: [{ ...base, revokedAt }] }), finalizedBytes,
  ), /Nonrevoked QR document version/);
  assert.deepEqual(verifyTrustDocumentQrBytes(
    registry, lookup, versionRegistry(), finalizedBytes,
  ), { status: 'valid' });
});

test('QR registry and lookup reject inherited, accessor, hidden and unsupported claims', () => {
  const { registry, lookup } = fixture();
  const inherited = Object.assign(Object.create({ tenantId: 'spoofed' }), registry);
  assert.throws(() => resolveTrustDocumentQrBinding(inherited, lookup), /QR registry must be a plain data record/);
  const accessor = { ...lookup };
  let getterCalls = 0;
  Object.defineProperty(accessor, 'tenantId', {
    enumerable: true, get() { getterCalls++; return scope.tenantId; },
  });
  assert.throws(() => resolveTrustDocumentQrBinding(registry, accessor),
    /QR lookup fields must be enumerable data properties/);
  assert.equal(getterCalls, 0);
  const hidden = { ...registry };
  Object.defineProperty(hidden, 'revoked', { value: true, enumerable: false });
  assert.throws(() => resolveTrustDocumentQrBinding(hidden, lookup),
    /QR registry fields must be enumerable data properties/);
  assert.throws(() => resolveTrustDocumentQrBinding(registry,
    { ...lookup, [Symbol('privileged')]: true }), /Unsupported QR lookup field/);
  const plain = Object.assign(Object.create(null), registry, {
    bindings: Object.freeze([Object.assign(Object.create(null), registry.bindings[0])]),
  });
  assert.deepEqual(resolveTrustDocumentQrBinding(plain,
    Object.assign(Object.create(null), lookup)),
  { status: 'bound', documentId: 'document-1', versionId: 'version-1' });
});

test('QR bindings reject malformed arrays and forged binding properties without executing getters', () => {
  const { registry, lookup } = fixture();
  const row = registry.bindings[0];
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: [row, , row],
  }, lookup), /QR bindings must not contain holes/);
  const getterArray = [row];
  let getterCalls = 0;
  Object.defineProperty(getterArray, '0', {
    enumerable: true, get() { getterCalls++; return row; },
  });
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: getterArray,
  }, lookup), /QR bindings must contain enumerable data elements/);
  assert.equal(getterCalls, 0);
  const hiddenArray = [row];
  Object.defineProperty(hiddenArray, 'paymentReceived', { value: true });
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: hiddenArray,
  }, lookup), /QR bindings must contain only array indices/);
  const inheritedRow = Object.assign(Object.create({ status: 'active' }), row);
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: [inheritedRow],
  }, lookup), /QR binding must be a plain data record/);
  const getterRow = { ...row };
  Object.defineProperty(getterRow, 'status', {
    enumerable: true, get() { getterCalls++; return 'active'; },
  });
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: [getterRow],
  }, lookup), /QR binding fields must be enumerable data properties/);
  assert.equal(getterCalls, 0);
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: [{ ...row, settledMinor: 100 }],
  }, lookup), /Unsupported QR binding field/);
  const missing = { ...row };
  delete missing.status;
  assert.throws(() => resolveTrustDocumentQrBinding({
    ...registry, bindings: [missing],
  }, lookup), /Missing own QR binding field: status/);
});
