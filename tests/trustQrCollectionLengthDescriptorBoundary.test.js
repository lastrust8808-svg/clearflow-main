import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding, verifyTrustDocumentQrBytes } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant-A', entityId: 'entity-A', trustId: 'trust-A' };
const lookup = { ...scope, tokenHashSha256: 'a'.repeat(64), asOfAt: '2026-11-20T12:00:00.000Z' };
const binding = { ...scope, documentId: 'document-A', versionId: 'version-A',
  tokenHashSha256: lookup.tokenHashSha256, status: 'active', issuedAt: '2026-11-19T12:00:00.000Z' };

function invalidLengthArray(value) {
  return new Proxy([binding], {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === 'length') return { ...descriptor, value };
      return descriptor;
    },
  });
}

for (const invalid of ['1', 1.5, -1, NaN, Infinity]) {
  test('QR binding collection rejects noncanonical length ' + String(invalid), () => {
    assert.throws(() => resolveTrustDocumentQrBinding(
      { ...scope, bindings: invalidLengthArray(invalid) }, lookup),
    /maximum entry count/);
  });
}

test('QR document version collection rejects noninteger descriptor length', () => {
  const versions = new Proxy([], {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === 'length') return { ...descriptor, value: '0' };
      return descriptor;
    },
  });
  assert.throws(() => verifyTrustDocumentQrBytes(
    { ...scope, bindings: [binding] }, lookup,
    { ...scope, documentId: 'document-A', versions }, Buffer.from('document')),
  /10000-record review limit/);
});
