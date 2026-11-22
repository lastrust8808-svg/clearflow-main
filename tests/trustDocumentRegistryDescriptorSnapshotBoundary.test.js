import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTrustDocumentVersion } from '../server/services/trustDocumentVersionPolicy.js';

const registry = {
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a', documentId: 'document-a',
  versions: [],
};
const proof = { versionId: 'version-a', sha256: 'a'.repeat(64) };

test('registry verification uses first validated scope descriptor without subsequent Proxy read', () => {
  let reads = 0;
  const proxy = new Proxy({ ...registry }, {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === 'tenantId') {
        reads++;
        return { ...descriptor, value: reads === 1 ? 'tenant-a' : 'intruder' };
      }
      return descriptor;
    },
    get(target, key) {
      if (key === 'tenantId') throw new Error('untrusted scope getter invoked');
      return Reflect.get(target, key);
    },
  });
  assert.deepEqual(verifyTrustDocumentVersion(proxy, proof), { status: 'unknown' });
  assert.equal(reads, 1);
});

test('registry verification does not invoke accessor-like Proxy reads of versions', () => {
  const proxy = new Proxy({ ...registry }, {
    get(target, key) {
      if (key === 'versions') throw new Error('untrusted version list getter invoked');
      return Reflect.get(target, key);
    },
  });
  assert.equal(verifyTrustDocumentVersion(proxy, proof).status, 'unknown');
});
