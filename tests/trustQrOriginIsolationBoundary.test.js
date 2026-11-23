import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrustDocumentQrLink, digestTrustDocumentQrLink } from '../server/services/trustDocumentQrPolicy.js';

// A QR locator is pinned to the exact approved public origin. Even a valid
// token must not be accepted under another tenant's verification hostname.
test('QR digest lookup rejects a valid token issued for a different public origin', () => {
  const a = 'https://verify-a.example.org';
  const b = 'https://verify-b.example.org';
  const issued = createTrustDocumentQrLink(a);
  assert.equal(digestTrustDocumentQrLink(issued.url, a), issued.tokenHashSha256);
  assert.throws(() => digestTrustDocumentQrLink(issued.url, b), /Invalid QR verification URL/);
  const swapped = issued.url.replace(a, b);
  assert.throws(() => digestTrustDocumentQrLink(swapped, a), /Invalid QR verification URL/);
  // A syntactically valid token on another origin is not proof of issuance
  // there. Caller must still enforce authenticated tenant-scoped registry.
  assert.equal(digestTrustDocumentQrLink(swapped, b), issued.tokenHashSha256);
});

test('QR digest lookup refuses URL authority lookalikes and noncanonical ports', () => {
  const origin = 'https://verify.example.org';
  const issued = createTrustDocumentQrLink(origin);
  const path = new URL(issued.url).pathname;
  for (const forged of [
    'https://verify.example.org.evil.org' + path,
    'https://verify.example.org@evil.org' + path,
    'https://evil.org@verify.example.org' + path,
    'https://verify.example.org:444' + path,
    'http://verify.example.org' + path,
  ]) {
    assert.throws(() => digestTrustDocumentQrLink(forged, origin), /Invalid QR verification URL|Noncanonical QR verification URL/);
  }
});
