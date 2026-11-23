import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant', entityId: 'entity', trustId: 'trust' };
const identity = { ...scope, documentId: 'document', versionId: 'version' };
const at = day => `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`;
const hash = digit => digit.repeat(64);
const revoked = (digit, issued, ended, receipt) => ({
  ...identity, tokenHashSha256: hash(digit), status: 'revoked',
  issuedAt: at(issued), revokedAt: at(ended), revocationEvidenceRef: receipt,
});
const active = (digit, issued) => ({
  ...identity, tokenHashSha256: hash(digit), status: 'active', issuedAt: at(issued),
});
const resolve = (bindings, token) => resolveTrustDocumentQrBinding(
  { ...scope, bindings },
  { ...scope, tokenHashSha256: token, asOfAt: at(15) },
);

test('QR rotation permits exact revocation-to-replacement handoff regardless of row order', () => {
  const rows = [
    active('c', 9),
    revoked('b', 5, 9, 'receipt-b'),
    revoked('a', 1, 5, 'receipt-a'),
  ];
  for (const bindings of [rows, [...rows].reverse()]) {
    assert.deepEqual(resolve(bindings, hash('c')), {
      status: 'bound', documentId: 'document', versionId: 'version',
    });
    assert.deepEqual(resolve(bindings, hash('b')), { status: 'unknown' });
    assert.deepEqual(resolve(bindings, hash('a')), { status: 'unknown' });
  }
});

test('QR rotation rejects equal issuance instants and duplicate open-ended windows for unknown tokens', () => {
  const rows = [
    active('c', 9),
    revoked('a', 1, 9, 'receipt-a'),
    revoked('b', 1, 5, 'receipt-b'),
  ];
  for (const bindings of [rows, [...rows].reverse()]) {
    assert.throws(() => resolve(bindings, hash('f')), /Overlapping QR bindings/);
  }
  assert.throws(
    () => resolve([active('c', 9), active('d', 9)], hash('f')),
    /Duplicate active QR document version/,
  );
});
