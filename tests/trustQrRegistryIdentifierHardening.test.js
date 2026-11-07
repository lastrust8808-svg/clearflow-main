import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustDocumentQrBinding } from '../server/services/trustDocumentQrRegistryPolicy.js';

const hash = 'a'.repeat(64);
const at = '2026-11-06T00:00:00.000Z';
const scope = { tenantId: 'tenant', entityId: 'entity', trustId: 'trust' };

function lookupWith(override) {
  return resolveTrustDocumentQrBinding(
    { ...scope, bindings: [] },
    { ...scope, tokenHashSha256: hash, asOfAt: at, ...override },
  );
}

test('QR registry accepts bounded well-formed identifiers', () => {
  assert.deepEqual(lookupWith({}), { status: 'unknown' });
});

test('QR lookup refuses invisible, reserved, and oversized identifiers', () => {
  for (const invalid of [
    'tenant\u200b', 'tenant\u202e', 'tenant\ufeff',
    'tenant\ufdd0', 'tenant\ufffe', 'tenant\u{1fffe}',
    'x'.repeat(257),
  ]) {
    assert.throws(() => lookupWith({ tenantId: invalid }));
  }
});

test('QR registry refuses invalid scope even for an unknown token', () => {
  for (const invalid of ['trust\u2060', 'trust\u{10ffff}', 'x'.repeat(257)]) {
    assert.throws(() => resolveTrustDocumentQrBinding(
      { ...scope, trustId: invalid, bindings: [] },
      { ...scope, trustId: invalid, tokenHashSha256: hash, asOfAt: at },
    ));
  }
});
