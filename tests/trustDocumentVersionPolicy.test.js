import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyTrustDocumentVersion, verifyTrustDocumentBytes } from '../server/services/trustDocumentVersionPolicy.js';

const digestA = 'a'.repeat(64);
const digestB = 'b'.repeat(64);
const digestC = 'c'.repeat(64);
const version = (sequence, overrides = {}) => ({
  versionId: 'version-' + sequence, sequence,
  tenantId: 'tenant-a', entityId: 'trust-a', trustId: 'trust-a', documentId: 'doc-a',
  sha256: sequence === 1 ? digestA : sequence === 2 ? digestB : digestC,
  status: 'current', evidenceRef: 'registration-' + sequence,
  registeredAt: '2026-10-' + String(sequence).padStart(2, '0') + 'T12:00:00.000Z',
  ...(overrides.status === 'revoked' ? {
    ...(!Object.hasOwn(overrides, 'revocationEvidenceRef')
      ? { revocationEvidenceRef: 'revocation-' + sequence } : {}),
    ...(!Object.hasOwn(overrides, 'revokedAt')
      ? { revokedAt: '2026-10-29T12:00:00.000Z' } : {}),
  } : {}),
  ...overrides,
});
const registry = versions => ({
  tenantId: 'tenant-a', entityId: 'trust-a', trustId: 'trust-a', documentId: 'doc-a', versions,
});
const check = (versions, proof) => verifyTrustDocumentVersion(registry(versions), proof);

test('matching computed file hash verifies only the current version', () => {
  const result = check([version(1)], { versionId: 'version-1', sha256: digestA });
  assert.deepEqual(result, { status: 'valid' });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Object.keys(result), ['status']);
});

test('superseded and revoked versions never verify as valid', () => {
  const versions = [version(1, { status: 'superseded' }), version(2)];
  assert.deepEqual(check(versions, { versionId: 'version-1', sha256: digestA }), { status: 'superseded' });
  assert.deepEqual(check(versions, { versionId: 'version-2', sha256: digestB }), { status: 'valid' });
  assert.deepEqual(check([version(1, { status: 'revoked' })], { versionId: 'version-1', sha256: digestA }), { status: 'revoked' });
  assert.deepEqual(check([version(1, { status: 'superseded' }), version(2, { status: 'revoked' })],
    { versionId: 'version-2', sha256: digestB }), { status: 'revoked' });
});

test('modified bytes or unknown version fail closed without disclosing status', () => {
  assert.deepEqual(check([version(1, { status: 'revoked' })],
    { versionId: 'version-1', sha256: digestB }), { status: 'unknown' });
  assert.deepEqual(check([version(1)],
    { versionId: 'unknown-version', sha256: digestA }), { status: 'unknown' });
  assert.deepEqual(check([],
    { versionId: 'version-1', sha256: digestA }), { status: 'unknown' });
});

test('rejects historical current versions and sequence gaps', () => {
  assert.throws(() => check([version(1), version(2)], { versionId: 'version-1', sha256: digestA }),
    /Historical document version cannot be current/);
  assert.throws(() => check([version(1, { status: 'superseded' })],
    { versionId: 'version-1', sha256: digestA }), /without a successor/);
  assert.throws(() => check([version(1, { status: 'superseded' }), version(3)],
    { versionId: 'version-3', sha256: digestC }), /sequence must be contiguous/);
});

test('rejects duplicate immutable version and registration identifiers', () => {
  assert.throws(() => check([version(1, { status: 'superseded' }),
    version(2, { versionId: 'version-1' })], { versionId: 'version-1', sha256: digestA }),
  /Duplicate document version ID/);
  assert.throws(() => check([version(1, { status: 'superseded' }),
    version(2, { evidenceRef: 'registration-1' })], { versionId: 'version-2', sha256: digestB }),
  /Duplicate document version evidence reference/);
});

test('revoked versions require unique revocation provenance distinct from registration', () => {
  for (const invalid of [undefined, null, '', ' ', ' padded ', 'bad\u0000', 42]) {
    assert.throws(() => check([version(1, {
      status: 'revoked', revocationEvidenceRef: invalid,
    })], { versionId: 'version-1', sha256: digestA }), /version.revocationEvidenceRef/);
  }
  assert.throws(() => check([version(1, {
    status: 'revoked', revocationEvidenceRef: 'registration-1',
  })], { versionId: 'version-1', sha256: digestA }), /Reused document version revocation evidence/);
  assert.throws(() => check([
    version(1, { status: 'revoked', revocationEvidenceRef: 'shared-revocation' }),
    version(2, { status: 'revoked', revocationEvidenceRef: 'shared-revocation' }),
  ], { versionId: 'version-2', sha256: digestB }), /Reused document version revocation evidence/);
  assert.throws(() => check([
    version(1, { status: 'superseded', evidenceRef: 'revocation-2' }),
    version(2, { status: 'revoked', revocationEvidenceRef: 'revocation-2' }),
  ], { versionId: 'version-2', sha256: digestB }), /Reused document version revocation evidence/);
  assert.throws(() => check([version(1, {
    status: 'current', revocationEvidenceRef: 'unexpected-revocation',
  })], { versionId: 'version-1', sha256: digestA }), /Nonrevoked document version/);
  assert.deepEqual(check([version(1, { status: 'revoked' })],
    { versionId: 'version-1', sha256: digestA }), { status: 'revoked' });
});

test('core version and byte verification reject invalid revocation chronology', () => {
  const proof = { versionId: 'version-1', sha256: digestA };
  for (const revokedAt of [undefined, null, '', '2026-02-30T12:00:00.000Z',
    '2026-10-01T12:00:00.000Z', '2026-09-30T12:00:00.000Z']) {
    assert.throws(() => check([version(1, { status: 'revoked', revokedAt })], proof),
      /version.revokedAt|revocation must follow registration/);
  }
  assert.throws(() => check([version(1, {
    status: 'current', revokedAt: '2026-10-29T12:00:00.000Z',
  })], proof), /Nonrevoked document version cannot carry revocation timestamp/);
  assert.deepEqual(check([version(1, { status: 'revoked',
    revokedAt: '2026-10-01T12:00:00.001Z' })], proof), { status: 'revoked' });
  const bytes = Buffer.from('revoked finalized bytes');
  assert.throws(() => verifyTrustDocumentBytes(registry([version(1, {
    status: 'revoked', sha256: fileDigest(bytes), revokedAt: undefined,
  })]), { versionId: 'version-1', content: bytes }), /version.revokedAt/);
});

test('rejects cross-tenant, cross-entity, cross-trust and cross-document version records', () => {
  for (const key of ['tenantId', 'entityId', 'trustId', 'documentId']) {
    assert.throws(() => check([version(1, { [key]: 'other' })],
      { versionId: 'version-1', sha256: digestA }), /scope mismatch/);
  }
});

test('core byte and digest verification fail closed on missing or mixed trust ownership', () => {
  const proof = { versionId: 'version-1', sha256: digestA };
  for (const trustId of [undefined, null, '', 'trust-b']) {
    const alteredRegistry = { ...registry([version(1)]), trustId };
    assert.throws(() => verifyTrustDocumentVersion(alteredRegistry, proof),
      /trustId|scope mismatch/);
    assert.throws(() => verifyTrustDocumentVersion(registry([
      version(1, { trustId }),
    ]), proof), /trustId scope mismatch/);
  }
  const bytes = Buffer.from('finalized bytes');
  const historical = version(1, { trustId: 'trust-b', status: 'superseded' });
  const current = version(2, { sha256: fileDigest(bytes) });
  assert.throws(() => verifyTrustDocumentBytes(registry([historical, current]), {
    versionId: 'version-2', content: bytes,
  }), /trustId scope mismatch/);
  assert.deepEqual(verifyTrustDocumentVersion(registry([version(1)]), proof),
    { status: 'valid' });
});

test('rejects malformed scope, version metadata and hash digests', () => {
  assert.throws(() => verifyTrustDocumentVersion(null, {}), /registry required/);
  assert.throws(() => verifyTrustDocumentVersion({ ...registry([]), entityId: 'tenant\u0000' },
    { versionId: 'version-1', sha256: digestA }), /entityId/);
  assert.throws(() => check([version(1, { sha256: digestA.toUpperCase() })],
    { versionId: 'version-1', sha256: digestA }), /lowercase SHA-256/);
  assert.throws(() => check([version(1)], { versionId: 'version-1', sha256: 'abc' }), /lowercase SHA-256/);
  assert.throws(() => check([version(1, { status: 'published' })],
    { versionId: 'version-1', sha256: digestA }), /Invalid document version status/);
  assert.throws(() => check([version(1, { evidenceRef: '' })],
    { versionId: 'version-1', sha256: digestA }), /evidenceRef/);
});

test('requires strictly ordered canonical timestamps and does not mutate records', () => {
  const versions = [version(1, { status: 'superseded' }), version(2)];
  const before = structuredClone(versions);
  assert.deepEqual(check(versions, { versionId: 'version-2', sha256: digestB }), { status: 'valid' });
  assert.deepEqual(versions, before);
  assert.throws(() => check([version(1, { status: 'superseded' }),
    version(2, { registeredAt: version(1).registeredAt })],
  { versionId: 'version-2', sha256: digestB }), /increasing registration timestamps/);
  assert.throws(() => check([version(1, { registeredAt: '2026-02-30T12:00:00.000Z' })],
    { versionId: 'version-1', sha256: digestA }), /canonical UTC timestamp/);
});

const fileDigest = bytes => createHash('sha256').update(bytes).digest('hex');

test('finalized PDF bytes are hashed server-side before version verification', () => {
  const bytes = Buffer.from('%PDF-1.7\\nfirst finalized bytes');
  const entry = version(1, { sha256: fileDigest(bytes) });
  const result = verifyTrustDocumentBytes(registry([entry]), { versionId: 'version-1', content: bytes });
  assert.deepEqual(result, { status: 'valid' });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Object.keys(result), ['status']);
  assert.deepEqual(verifyTrustDocumentBytes(registry([entry]), {
    versionId: 'version-1', content: Buffer.from('%PDF-1.7\\ntampered bytes'),
    sha256: entry.sha256, // caller-provided digest must be ignored
  }), { status: 'unknown' });
});

test('byte-level verification preserves revoked and superseded statuses', () => {
  const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x01]);
  const first = version(1, { status: 'superseded', sha256: fileDigest(bytes) });
  const second = version(2, { sha256: fileDigest(Buffer.from('replacement')) });
  assert.deepEqual(verifyTrustDocumentBytes(registry([first, second]),
    { versionId: 'version-1', content: bytes }), { status: 'superseded' });
  assert.deepEqual(verifyTrustDocumentBytes(registry([version(1, { status: 'revoked', sha256: fileDigest(bytes) })]),
    { versionId: 'version-1', content: bytes }), { status: 'revoked' });
});

test('byte proof rejects absent, empty, or nonbinary documents', () => {
  const entry = version(1);
  for (const proof of [null, [], {}, { versionId: 'version-1', content: '' },
    { versionId: 'version-1', content: Buffer.alloc(0) },
    { versionId: 'version-1', content: new Uint8Array(0) }]) {
    assert.throws(() => verifyTrustDocumentBytes(registry([entry]), proof), /proof required|bytes required/);
  }
  assert.throws(() => verifyTrustDocumentBytes(registry([entry]),
    { versionId: '', content: Buffer.from('valid') }), /versionId/);
});

test('byte-level verification rejects registry scope mismatch', () => {
  const bytes = Buffer.from('valid bytes');
  assert.throws(() => verifyTrustDocumentBytes(registry([version(1, {
    tenantId: 'another-tenant', sha256: fileDigest(bytes),
  })]), { versionId: 'version-1', content: bytes }), /scope mismatch/);
});


test('version registry rejects malformed arrays before accessing any version', () => {
  const proof = { versionId: 'version-1', sha256: digestA };
  const verify = versions => verifyTrustDocumentVersion(registry(versions), proof);
  const sparse = new Array(1);
  const inherited = [version(1)];
  Object.setPrototypeOf(inherited, Object.create(Array.prototype));
  const accessor = [version(1)];
  let getterCalls = 0;
  Object.defineProperty(accessor, '0', {
    configurable: true, enumerable: true,
    get() { getterCalls++; throw new Error('unsafe getter executed'); },
  });
  const hidden = [version(1)];
  Object.defineProperty(hidden, 'metadata', { value: 'unreviewed' });
  const symbolic = [version(1)];
  symbolic[Symbol('unreviewed')] = 'metadata';
  const extended = [version(1)];
  extended.extra = version(2);
  for (const versions of [sparse, inherited, accessor, hidden, symbolic, extended]) {
    assert.throws(() => verify(versions), /Document versions must/);
  }
  assert.equal(getterCalls, 0);
  assert.deepEqual(verify(Object.freeze([Object.freeze(version(1))])), { status: 'valid' });
  assert.deepEqual(verify(Object.freeze([])), { status: 'unknown' });
});


test('document version records reject getters, hidden claims and unsupported fields without executing code', () => {
  let getterCalls = 0;
  const accessor = version(1);
  Object.defineProperty(accessor, 'sha256', {
    enumerable: true, configurable: true,
    get() { getterCalls++; throw new Error('untrusted getter executed'); },
  });
  const hidden = version(1);
  Object.defineProperty(hidden, 'metadata', { value: 'unreviewed' });
  const symbolic = version(1);
  symbolic[Symbol('hidden')] = 'unreviewed';
  const unsupported = version(1, { paymentReceived: true });
  const inherited = Object.assign(Object.create({ versionId: 'version-1' }), version(1));
  for (const invalid of [accessor, hidden, symbolic, unsupported, inherited]) {
    assert.throws(() => check([invalid], { versionId: 'version-1', sha256: digestA }),
      /Document version (fields must|contains unsupported|must be a plain)/);
  }
  assert.equal(getterCalls, 0);
});

test('document version verification accepts frozen and null-prototype plain records', () => {
  const frozen = Object.freeze(version(1));
  const nullPrototype = Object.assign(Object.create(null), version(1));
  const proof = { versionId: 'version-1', sha256: digestA };
  assert.deepEqual(check([frozen], proof), { status: 'valid' });
  assert.deepEqual(check([nullPrototype], proof), { status: 'valid' });
  assert.deepEqual(verifyTrustDocumentBytes(registry([nullPrototype]), {
    versionId: 'version-1', content: Buffer.from('unmatched bytes'),
  }), { status: 'unknown' });
});
