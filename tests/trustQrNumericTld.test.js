import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicQrOrigin, createTrustDocumentQrLink } from '../server/services/trustDocumentQrPolicy.js';
import { createApprovedTrustDocumentQrLink } from '../server/services/trustDocumentQrApprovedOrigin.js';

test('public QR origin rejects numeric top-level DNS labels', () => {
  for (const origin of [
    'https://verify.example.123',
    'https://verify.example.000',
    'https://verify.example.9',
  ]) {
    assert.throws(() => validatePublicQrOrigin(origin), { name: 'TypeError' });
    assert.throws(() => createTrustDocumentQrLink(origin), { name: 'TypeError' });
    assert.throws(() => createApprovedTrustDocumentQrLink(origin, [origin]), { name: 'TypeError' });
  }
});

test('public QR origin still accepts canonical alphabetic and punycode suffixes', () => {
  assert.equal(validatePublicQrOrigin('https://verify.example.org'), 'https://verify.example.org');
  assert.equal(validatePublicQrOrigin('https://verify.example.xn--p1ai'), 'https://verify.example.xn--p1ai');
});
