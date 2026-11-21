import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const scope = Object.freeze({ tenantId: 'tenant-date', entityId: 'entity-date', trustId: 'trust-date' });
const hash = 'a'.repeat(64);
const issuedAt = '2026-11-15T12:00:00.000Z';
const asOfAt = '2026-11-15T13:00:00.000Z';

function resolve(overrides = {}, lookupOverrides = {}) {
  return resolveTrustDocumentQrBinding({
    ...scope,
    bindings: [{
      ...scope, documentId: 'document-date', versionId: 'version-date',
      tokenHashSha256: hash, status: 'active', issuedAt, ...overrides,
    }],
  }, { ...scope, tokenHashSha256: hash, asOfAt, ...lookupOverrides });
}

test('QR registry rejects noncanonical or impossible issuance timestamps', () => {
  for (const invalid of [
    '2026-02-29T12:00:00.000Z',
    '2026-11-31T12:00:00.000Z',
    '2026-11-15T24:00:00.000Z',
    '2026-11-15T12:00:60.000Z',
    '2026-11-15T12:00:00Z',
    '2026-11-15T12:00:00.000+00:00',
  ]) {
    assert.throws(() => resolve({ issuedAt: invalid }), /canonical UTC timestamp/);
  }
});

test('QR registry rejects invalid as-of instants and future issuance', () => {
  assert.throws(() => resolve({}, { asOfAt: '2026-11-31T13:00:00.000Z' }), /canonical UTC timestamp/);
  assert.throws(() => resolve({ issuedAt: '2026-11-15T13:00:00.001Z' }), /issued after lookup/);
  assert.deepEqual(resolve({ issuedAt: asOfAt }), {
    status: 'bound', documentId: 'document-date', versionId: 'version-date',
  });
});
