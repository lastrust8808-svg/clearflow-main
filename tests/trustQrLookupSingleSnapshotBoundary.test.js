import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTrustDocumentQrBytes } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant-A', entityId: 'entity-A', trustId: 'trust-A' };
const hash = 'a'.repeat(64);
const at = '2026-11-22T10:00:00.000Z';

test('QR byte verification snapshots lookup descriptors once', () => {
  let reads = 0;
  const lookup = new Proxy({ ...scope, tokenHashSha256: hash, asOfAt: at }, {
    getOwnPropertyDescriptors(target) {
      reads++;
      if (reads > 1) throw new Error('lookup inspected twice');
      return Object.getOwnPropertyDescriptors(target);
    },
  });
  // No binding matches: the wrapper should return unknown without needing
  // document-version records or finalized bytes.
  assert.deepEqual(verifyTrustDocumentQrBytes({ ...scope, bindings: [] }, lookup, null, null),
    { status: 'unknown' });
  assert.equal(reads, 1);
});

test('QR byte verification rejects malformed lookup before binding traversal', () => {
  let traversed = false;
  const bindings = new Proxy([], {
    getOwnPropertyDescriptor(target, key) {
      if (key !== 'length') traversed = true;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    ownKeys(target) {
      traversed = true;
      return Reflect.ownKeys(target);
    },
  });
  assert.throws(() => verifyTrustDocumentQrBytes(
    { ...scope, bindings },
    { ...scope, tokenHashSha256: 'invalid', asOfAt: at },
    null, null,
  ), /lowercase SHA-256 digest/);
  assert.equal(traversed, false);
});
