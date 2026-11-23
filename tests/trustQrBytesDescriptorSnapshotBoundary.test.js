import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyTrustDocumentQrBytes } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant-A', entityId: 'entity-A', trustId: 'trust-A' };
const bytes = Buffer.from('finalized QR test document');
const hash = createHash('sha256').update(bytes).digest('hex');
const tokenHashSha256 = 'a'.repeat(64);
const registeredAt = '2026-11-19T12:00:00.000Z';
const issuedAt = '2026-11-19T13:00:00.000Z';
const lookup = { ...scope, tokenHashSha256, asOfAt: '2026-11-20T12:00:00.000Z' };
const binding = { ...scope, documentId: 'document-A', versionId: 'version-A',
  tokenHashSha256, status: 'active', issuedAt };
const version = { ...scope, documentId: 'document-A', versionId: 'version-A',
  sequence: 1, sha256: hash, status: 'current', registeredAt, evidenceRef: 'evidence-A' };

function guard(target, key) {
  return new Proxy(target, {
    get(object, property, receiver) {
      if (property === key) throw new Error('unsafe direct property read: ' + key);
      return Reflect.get(object, property, receiver);
    },
  });
}

test('QR byte verification avoids direct reads of registry and lookup scope', () => {
  const qr = guard({ ...scope, bindings: [binding] }, 'tenantId');
  const query = guard({ ...lookup }, 'asOfAt');
  const registry = { ...scope, documentId: 'document-A', versions: [version] };
  assert.deepEqual(verifyTrustDocumentQrBytes(qr, query, registry, bytes), { status: 'valid' });
});

test('QR byte verification uses admitted version header and token binding descriptors', () => {
  const qr = { ...scope, bindings: [guard({ ...binding }, 'issuedAt')] };
  const registry = guard({ ...scope, documentId: 'document-A',
    versions: [version] }, 'tenantId');
  assert.deepEqual(verifyTrustDocumentQrBytes(qr, lookup, registry, bytes), { status: 'valid' });
});
