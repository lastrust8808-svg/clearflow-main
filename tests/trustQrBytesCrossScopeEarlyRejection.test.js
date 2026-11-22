import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTrustDocumentQrBytes } from '../server/services/trustDocumentQrRegistryPolicy.js';

test('QR bytes verification rejects cross-scope lookup without inspecting binding rows', () => {
  let inspected = false;
  const bindings = new Proxy([], {
    getOwnPropertyDescriptor() { inspected = true; throw new Error('binding inspected'); },
    ownKeys() { inspected = true; throw new Error('binding enumerated'); },
  });
  const registry = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', bindings };
  const lookup = { tenantId: 'tenant-other', entityId: 'entity-a', trustId: 'trust-a',
    tokenHashSha256: 'a'.repeat(64), asOfAt: '2026-11-22T07:00:00.000Z' };
  assert.throws(() => verifyTrustDocumentQrBytes(registry, lookup, {}, Buffer.alloc(0)),
    /QR lookup tenant\/entity scope mismatch/);
  assert.equal(inspected, false);
});
