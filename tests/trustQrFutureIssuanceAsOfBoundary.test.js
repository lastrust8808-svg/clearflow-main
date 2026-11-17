import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = { tenantId: 'tenant-future-issuance', entityId: 'entity-future-issuance', trustId: 'trust-future-issuance' };
const tokenHashSha256 = createHash('sha256').update('future-issued-token').digest('hex');
const unknownHash = createHash('sha256').update('unrelated-token').digest('hex');

function registry(issuedAt) {
  return { ...scope, bindings: [{
    ...scope, documentId: 'document-future-issuance', versionId: 'version-future-issuance',
    tokenHashSha256, status: 'active', issuedAt,
  }] };
}

test('unknown token lookup cannot admit QR bindings issued after the trusted as-of instant', () => {
  assert.throws(
    () => resolveTrustDocumentQrBinding(registry('2028-02-29T12:00:00.001Z'), {
      ...scope, tokenHashSha256: unknownHash, asOfAt: '2028-02-29T12:00:00.000Z',
    }),
    /QR binding issued after lookup as-of timestamp/,
  );
});

test('QR issuance exactly at trusted as-of instant is admitted without leaking unknown token identity', () => {
  const at = '2028-02-29T12:00:00.000Z';
  assert.deepEqual(resolveTrustDocumentQrBinding(registry(at), {
    ...scope, tokenHashSha256: unknownHash, asOfAt: at,
  }), { status: 'unknown' });
  assert.deepEqual(resolveTrustDocumentQrBinding(registry(at), {
    ...scope, tokenHashSha256, asOfAt: at,
  }), { status: 'bound', documentId: 'document-future-issuance', versionId: 'version-future-issuance' });
});

test('future-issued sibling binding is rejected regardless of registry order or queried token', () => {
  const current = registry('2028-02-29T12:00:00.000Z').bindings[0];
  const future = {
    ...current,
    documentId: 'document-future-sibling',
    versionId: 'version-future-sibling',
    tokenHashSha256: createHash('sha256').update('future-sibling-token').digest('hex'),
    issuedAt: '2028-02-29T12:00:00.001Z',
  };
  const asOfAt = '2028-02-29T12:00:00.000Z';
  for (const bindings of [[current, future], [future, current]]) {
    for (const requestedHash of [unknownHash, current.tokenHashSha256, future.tokenHashSha256]) {
      assert.throws(
        () => resolveTrustDocumentQrBinding({ ...scope, bindings }, {
          ...scope, tokenHashSha256: requestedHash, asOfAt,
        }),
        /QR binding issued after lookup as-of timestamp/,
      );
    }
  }
});
