import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

test('malformed QR lookup timestamp or digest is rejected before reading bindings', () => {
  let traversals = 0;
  const bindings = new Proxy([], {
    ownKeys() { traversals++; throw new Error('binding traversal occurred'); },
  });
  const registry = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', bindings };
  const valid = {
    tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
    tokenHashSha256: 'a'.repeat(64), asOfAt: '2026-11-22T09:00:00.000Z',
  };
  assert.throws(() => resolveTrustDocumentQrBinding(registry, { ...valid, asOfAt: 'not-a-date' }), /canonical UTC timestamp/);
  assert.throws(() => resolveTrustDocumentQrBinding(registry, { ...valid, tokenHashSha256: 'not-a-digest' }), /lowercase SHA-256 digest/);
  assert.equal(traversals, 0);
});
