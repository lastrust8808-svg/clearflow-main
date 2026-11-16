import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrustDocumentQrLink, digestTrustDocumentQrLink } from '../server/services/trustDocumentQrPolicy.js';

// A published locator is a single canonical URL, not a prefix that can
// carry arbitrary tracking metadata or alternate route semantics.
test('QR digest rejects query and fragment additions to an otherwise valid issued locator', () => {
  const origin = 'https://verify.example.org';
  const issued = createTrustDocumentQrLink(origin);
  assert.equal(digestTrustDocumentQrLink(issued.url, origin), issued.tokenHashSha256);
  for (const suffix of ['?tenant=other', '?', '#document', '#', '?x=1#y']) {
    assert.throws(
      () => digestTrustDocumentQrLink(issued.url + suffix, origin),
      /Invalid QR verification URL|Noncanonical QR verification URL/,
      suffix,
    );
  }
});

test('QR digest rejects alternate paths, trailing separators and encoded route delimiters', () => {
  const origin = 'https://verify.example.org';
  const issued = createTrustDocumentQrLink(origin);
  const token = issued.url.split('/').at(-1);
  for (const forged of [
    `${origin}/verify/document/${token}/`,
    `${origin}/verify/document//${token}`,
    `${origin}/verify/document/%2F${token}`,
    `${origin}/verify/documents/${token}`,
  ]) {
    assert.throws(
      () => digestTrustDocumentQrLink(forged, origin),
      /Invalid QR verification URL|Noncanonical QR verification URL|Invalid opaque QR verification token/,
      forged,
    );
  }
});
