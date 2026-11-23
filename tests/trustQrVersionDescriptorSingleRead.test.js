import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyTrustDocumentQrBytes } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant-A', entityId: 'entity-A', trustId: 'trust-A' };
const content = Buffer.from('immutable QR descriptor snapshot regression');
const tokenHashSha256 = 'a'.repeat(64);
const binding = { ...scope, documentId: 'doc-A', versionId: 'version-A',
  tokenHashSha256, status: 'active', issuedAt: '2026-11-20T13:00:00.000Z' };
const version = { ...scope, documentId: 'doc-A', versionId: 'version-A',
  sequence: 1, sha256: createHash('sha256').update(content).digest('hex'),
  status: 'current', registeredAt: '2026-11-20T12:00:00.000Z', evidenceRef: 'receipt-A' };
const qr = { ...scope, bindings: [binding] };
const lookup = { ...scope, tokenHashSha256, asOfAt: '2026-11-20T14:00:00.000Z' };

test('QR byte verification never requests a second version array descriptor snapshot', () => {
  let reads = 0;
  const versions = new Proxy([version], {
    ownKeys(target) { return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) {
      if (key === '0' && ++reads > 1) throw new Error('second index descriptor read');
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    get(target, key) {
      if (key === '0') throw new Error('direct index read');
      return Reflect.get(target, key);
    },
  });
  assert.deepEqual(verifyTrustDocumentQrBytes(qr, lookup,
    { ...scope, documentId: 'doc-A', versions }, content), { status: 'valid' });
  assert.equal(reads, 1);
});

test('QR byte verification never requests a second version record descriptor snapshot', () => {
  let reads = 0;
  const record = new Proxy({ ...version }, {
    ownKeys(target) {
      if (++reads > 1) throw new Error('second record descriptor enumeration');
      return Reflect.ownKeys(target);
    },
    get(target, key) {
      if (key === 'sha256') throw new Error('unsafe record property read');
      return Reflect.get(target, key);
    },
  });
  assert.deepEqual(verifyTrustDocumentQrBytes(qr, lookup,
    { ...scope, documentId: 'doc-A', versions: [record] }, content), { status: 'valid' });
  assert.equal(reads, 1);
});
