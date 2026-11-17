import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

// A single trusted instant cannot admit two successor tokens for one version.
const scope = { tenantId: 'tenant-fork', entityId: 'entity-fork', trustId: 'trust-fork' };
const document = { ...scope, documentId: 'document-fork', versionId: 'version-fork' };
const at = '2026-11-17T10:00:00.000Z';
const predecessor = { ...document, tokenHashSha256: 'a'.repeat(64), status: 'revoked',
  issuedAt: '2026-11-16T10:00:00.000Z', revokedAt: at,
  revocationEvidenceRef: 'receipt-fork' };
const successorA = { ...document, tokenHashSha256: 'b'.repeat(64),
  status: 'active', issuedAt: at };
const successorB = { ...document, tokenHashSha256: 'c'.repeat(64),
  status: 'revoked', issuedAt: at, revokedAt: '2026-11-17T10:00:00.001Z',
  revocationEvidenceRef: 'receipt-fork-second' };

test('same-instant QR rotation rejects a forked successor in every registry order', () => {
  for (const bindings of [
    [predecessor, successorA, successorB],
    [successorB, predecessor, successorA],
    [successorA, successorB, predecessor],
  ]) {
    const registry = { ...scope, bindings };
    for (const tokenHashSha256 of ['d'.repeat(64), successorA.tokenHashSha256, successorB.tokenHashSha256]) {
      assert.throws(() => resolveTrustDocumentQrBinding(registry,
        { ...scope, tokenHashSha256, asOfAt: '2026-11-17T10:00:00.001Z' }),
      /Duplicate active QR document version|Overlapping QR bindings for document version/);
    }
  }
});

test('sequential revoked QR rotations permit exact handoff without an active token', () => {
  const first = { ...predecessor };
  const second = { ...successorB, issuedAt: at };
  for (const bindings of [[first, second], [second, first]]) {
    const registry = { ...scope, bindings };
    for (const tokenHashSha256 of [first.tokenHashSha256, second.tokenHashSha256, 'd'.repeat(64)]) {
      assert.deepEqual(resolveTrustDocumentQrBinding(registry, {
        ...scope, tokenHashSha256, asOfAt: '2026-11-17T10:00:00.001Z',
      }), { status: 'unknown' });
    }
  }
});
