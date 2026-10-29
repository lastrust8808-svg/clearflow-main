import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTrustDocumentVersion } from '../server/services/trustDocumentVersionPolicy.js';

const digestA = 'a'.repeat(64);
const digestB = 'b'.repeat(64);
const digestC = 'c'.repeat(64);
const version = (sequence, overrides = {}) => ({
  versionId: 'version-' + sequence, sequence,
  sha256: sequence === 1 ? digestA : sequence === 2 ? digestB : digestC,
  status: 'current', evidenceRef: 'registration-' + sequence,
  registeredAt: '2026-10-' + String(sequence).padStart(2, '0') + 'T12:00:00.000Z',
  ...overrides,
});
const registry = versions => ({
  tenantId: 'tenant-a', entityId: 'trust-a', documentId: 'doc-a', versions,
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
