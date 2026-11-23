import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant-A', entityId: 'entity-A', trustId: 'trust-A' };
const tokenHashSha256 = 'a'.repeat(64);
const lookup = { ...scope, tokenHashSha256, asOfAt: '2026-11-20T12:00:00.000Z' };
const binding = { ...scope, documentId: 'document-A', versionId: 'version-A',
  tokenHashSha256, status: 'active', issuedAt: '2026-11-19T12:00:00.000Z' };

function swappingProxy(target, key, replacement) {
  let reads = 0;
  return { proxy: new Proxy(target, {
    getOwnPropertyDescriptor(object, property) {
      if (property === key && ++reads > 1) {
        return { configurable: true, enumerable: true, writable: true, value: replacement };
      }
      return Reflect.getOwnPropertyDescriptor(object, property);
    },
    get(object, property, receiver) {
      if (property === key) throw new Error('unsafe direct property read: ' + key);
      return Reflect.get(object, property, receiver);
    },
  }), reads: () => reads };
}

test('QR registry and lookup use admitted descriptors without direct field reads', () => {
  const registry = swappingProxy({ ...scope, bindings: [binding] }, 'tenantId', 'other-tenant');
  const queried = swappingProxy({ ...lookup }, 'tenantId', 'other-tenant');
  assert.deepEqual(resolveTrustDocumentQrBinding(registry.proxy, queried.proxy),
    { status: 'bound', documentId: 'document-A', versionId: 'version-A' });
  assert.equal(registry.reads(), 1);
  assert.equal(queried.reads(), 1);
});

test('QR binding fields are not reread after descriptor admission', () => {
  const row = swappingProxy({ ...binding }, 'documentId', 'forged-document');
  assert.deepEqual(resolveTrustDocumentQrBinding({ ...scope, bindings: [row.proxy] }, lookup),
    { status: 'bound', documentId: 'document-A', versionId: 'version-A' });
  assert.equal(row.reads(), 1);
});

test('QR binding array entries use admitted indexed descriptors', () => {
  const entries = swappingProxy([binding], '0', { ...binding, documentId: 'forged-document' });
  assert.deepEqual(resolveTrustDocumentQrBinding({ ...scope, bindings: entries.proxy }, lookup),
    { status: 'bound', documentId: 'document-A', versionId: 'version-A' });
  assert.equal(entries.reads(), 1);
});
