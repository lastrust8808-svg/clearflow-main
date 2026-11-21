import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requireApprovedQrOrigin,
  createApprovedTrustDocumentQrLink,
  digestApprovedTrustDocumentQrLink,
} from '../server/services/trustDocumentQrApprovedOrigin.js';

const approved = 'https://verify.example.org';

test('QR authorization does not silently normalize origin aliases', () => {
  for (const alias of [
    'https://VERIFY.example.org',
    'https://verify.example.org.',
    'https://verify.example.org:443',
    'https://verify.example.org/',
    'https://verify.example.org?x=1',
    'https://verify.example.org#fragment',
  ]) {
    assert.notEqual(alias, approved);
    assert.throws(() => requireApprovedQrOrigin(alias, [approved]));
    assert.throws(() => createApprovedTrustDocumentQrLink(alias, [approved]));
  }
});

test('QR lookup requires the same explicitly approved origin as issuance', () => {
  const other = 'https://other.example.org';
  const issued = createApprovedTrustDocumentQrLink(approved, [approved, other]);
  assert.equal(digestApprovedTrustDocumentQrLink(issued.url, approved, [approved, other]), issued.tokenHashSha256);
  assert.throws(() => digestApprovedTrustDocumentQrLink(issued.url, other, [approved, other]));
  assert.throws(() => digestApprovedTrustDocumentQrLink(issued.url, approved, [other]));
});
