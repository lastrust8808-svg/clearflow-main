import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

test('QR registry reads a caller-controlled record prototype only once', () => {
  let prototypeReads = 0;
  const registry = new Proxy({
    tenantId: 'tenant-1',
    entityId: 'entity-1',
    trustId: 'trust-1',
    bindings: [],
  }, {
    getPrototypeOf(target) {
      prototypeReads++;
      if (prototypeReads > 1) throw new Error('Repeated prototype inspection');
      return Reflect.getPrototypeOf(target);
    },
  });
  const decision = resolveTrustDocumentQrBinding(registry, {
    tenantId: 'tenant-1',
    entityId: 'entity-1',
    trustId: 'trust-1',
    tokenHashSha256: 'a'.repeat(64),
    asOfAt: '2026-11-20T14:00:00.000Z',
  });
  assert.deepEqual(decision, { status: 'unknown' });
  assert.equal(prototypeReads, 1);
});
