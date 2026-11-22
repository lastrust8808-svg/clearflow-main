import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPlainTrustDocumentVersions } from '../server/services/trustDocumentVersionPolicy.js';

test('document version prototype is inspected once during structural admission', () => {
  let reads = 0;
  const version = new Proxy({ versionId: 'version-a' }, {
    getPrototypeOf(target) {
      reads++;
      if (reads > 1) throw new Error('Repeated untrusted prototype inspection');
      return Reflect.getPrototypeOf(target);
    },
  });
  assert.doesNotThrow(() => assertPlainTrustDocumentVersions([version]));
  assert.equal(reads, 1);
});

test('document version with foreign prototype is rejected', () => {
  const version = Object.create({ inheritedAuthority: true });
  version.versionId = 'version-a';
  assert.throws(() => assertPlainTrustDocumentVersions([version]),
    /Document version must be a plain record/);
});
