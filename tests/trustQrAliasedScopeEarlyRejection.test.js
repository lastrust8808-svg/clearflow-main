import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

test('aliased QR registry ownership is rejected before binding array traversal', () => {
  let traversed = false;
  const bindings = new Proxy([], {
    getPrototypeOf() { traversed = true; throw new Error('binding traversal'); },
    getOwnPropertyDescriptor() { traversed = true; throw new Error('binding descriptor traversal'); },
  });
  const registry = {
    tenantId: 'same-owner', entityId: 'same-owner', trustId: 'trust-1', bindings,
  };
  const lookup = {
    tenantId: 'same-owner', entityId: 'same-owner', trustId: 'trust-1',
    tokenHashSha256: 'a'.repeat(64), asOfAt: '2026-11-22T11:00:00.000Z',
  };
  assert.throws(() => resolveTrustDocumentQrBinding(registry, lookup),
    /tenant, entity and trust identifiers must be distinct/);
  assert.equal(traversed, false);
});
