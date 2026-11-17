import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = Object.freeze({ tenantId: 'tenant', entityId: 'entity', trustId: 'trust' });
const base = Object.freeze({ ...scope, documentId: 'document', versionId: 'version' });
const at = day => `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`;
const hash = character => character.repeat(64);
const revoked = (character, issued, ended, receipt) => ({
  ...base, tokenHashSha256: hash(character), status: 'revoked',
  issuedAt: at(issued), revokedAt: at(ended), revocationEvidenceRef: receipt,
});
const active = (character, issued) => ({
  ...base, tokenHashSha256: hash(character), status: 'active', issuedAt: at(issued),
});
function resolve(bindings, token = hash('f')) {
  return resolveTrustDocumentQrBinding(
    { ...scope, bindings },
    { ...scope, tokenHashSha256: token, asOfAt: at(15) },
  );
}

test('out-of-order nonoverlapping QR rotations preserve final active token only', () => {
  const bindings = [
    active('c', 9),
    revoked('a', 1, 4, 'receipt-a'),
    revoked('b', 4, 9, 'receipt-b'),
  ];
  assert.deepEqual(resolve(bindings, hash('a')), { status: 'unknown' });
  assert.deepEqual(resolve(bindings, hash('b')), { status: 'unknown' });
  assert.deepEqual(resolve(bindings, hash('c')), {
    status: 'bound', documentId: 'document', versionId: 'version',
  });
});

test('QR rotation rejects an overlap between two revoked intervals even for unknown tokens', () => {
  const bindings = [
    active('c', 9),
    revoked('a', 1, 6, 'receipt-a'),
    revoked('b', 4, 9, 'receipt-b'),
  ];
  assert.throws(() => resolve(bindings), /Overlapping QR bindings/);
});

test('QR rotation rejects a historical revoked token issued after the active replacement', () => {
  const bindings = [
    active('c', 9),
    revoked('a', 1, 4, 'receipt-a'),
    revoked('b', 10, 12, 'receipt-b'),
  ];
  assert.throws(() => resolve(bindings), /Overlapping QR bindings/);
});
