import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

test('cross-scope QR lookup rejects before reading binding rows', () => {
  let inspected = false;
  const bindings = new Proxy([], {
    getOwnPropertyDescriptor(target, key) {
      inspected = true;
      throw new Error('cross-scope binding traversal');
    },
    ownKeys() {
      inspected = true;
      throw new Error('cross-scope binding enumeration');
    },
  });
  const registry = {
    tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', bindings,
  };
  const lookup = {
    tenantId: 'tenant-other', entityId: 'entity-a', trustId: 'trust-a',
    tokenHashSha256: 'a'.repeat(64), asOfAt: '2026-11-22T07:00:00.000Z',
  };
  assert.throws(() => resolveTrustDocumentQrBinding(registry, lookup),
    /QR lookup tenant\/entity scope mismatch/);
  assert.equal(inspected, false);
});
