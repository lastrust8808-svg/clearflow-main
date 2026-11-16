import test from 'node:test';
import assert from 'node:assert/strict';
import { requireApprovedQrOrigin, createApprovedTrustDocumentQrLink, digestApprovedTrustDocumentQrLink } from '../server/services/trustDocumentQrApprovedOrigin.js';

const approved = 'https://verify.example.org';

test('QR issue and lookup reject origin userinfo confusion even with approved host suffix', () => {
  const deceptive = [
    'https://verify.example.org@attacker.example.net',
    'https://attacker.example.net@verify.example.org',
    'https://verify.example.org%40attacker.example.net',
    'https://verify.example.org.evil.example.net',
  ];
  for (const candidate of deceptive) {
    assert.throws(() => requireApprovedQrOrigin(candidate, [approved]));
    assert.throws(() => createApprovedTrustDocumentQrLink(candidate, [approved]));
  }
});

test('QR lookup refuses credentials, alternate ports, and encoded path separators', () => {
  const link = createApprovedTrustDocumentQrLink(approved, [approved]);
  assert.equal(digestApprovedTrustDocumentQrLink(link.url, approved, [approved]), link.tokenHashSha256);
  const token = link.url.split('/').at(-1);
  for (const candidate of [
    `https://user:pass@verify.example.org/verify/document/${token}`,
    `https://verify.example.org:444/verify/document/${token}`,
    `https://verify.example.org/verify%2Fdocument/${token}`,
    `https://verify.example.org/verify/document/%2F${token}`,
  ]) {
    assert.throws(() => digestApprovedTrustDocumentQrLink(candidate, approved, [approved]));
  }
});
