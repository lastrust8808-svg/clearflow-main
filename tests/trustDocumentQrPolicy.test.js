import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTrustDocumentQrLink, digestTrustDocumentQrLink } from '../server/services/trustDocumentQrPolicy.js';

const origin = 'https://verify.example.org';

test('creates unique opaque 256-bit QR lookup URLs with only hashed registry keys', () => {
  const first = createTrustDocumentQrLink(origin);
  const second = createTrustDocumentQrLink(origin);
  assert.notEqual(first.url, second.url);
  assert.notEqual(first.tokenHashSha256, second.tokenHashSha256);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(Object.keys(first), ['url', 'tokenHashSha256']);
  const token = first.url.split('/').at(-1);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  assert.equal(first.tokenHashSha256, createHash('sha256').update(Buffer.from(token, 'base64url')).digest('hex'));
  assert.equal(digestTrustDocumentQrLink(first.url, origin), first.tokenHashSha256);
  assert.doesNotMatch(first.url, /tenant|trust|documentId|sha256|beneficiary/i);
});

test('refuses insecure, noncanonical, or metadata-bearing verification origins', () => {
  for (const bad of ['http://verify.example.org', 'https://verify.example.org/',
    'https://verify.example.org/path', 'https://verify.example.org?x=1',
    'https://user:pass@verify.example.org', 'https://verify.example.org#fragment',
    'https://verify.example.org:443', 'not-a-url', '', null]) {
    assert.throws(() => createTrustDocumentQrLink(bad), /Canonical HTTPS verification origin/);
  }
});

test('rejects alternate origins, path changes, query, fragments and credentials', () => {
  const { url } = createTrustDocumentQrLink(origin);
  for (const bad of [url.replace(origin, 'https://evil.example.org'),
    url.replace('/verify/document/', '/verify/documents/'),
    url.replace('/verify/document/', '/verify/document/../document/'),
    url.replace('/verify/document/', '/verify/document/%2e%2e/'),
    url + '?documentId=secret', url + '#tenant-a',
    url.replace('https://', 'https://user@'),
    url.replace('/verify/document/', '/verify/document/%'),
    url + '/', url.replace('https://', 'http://')]) {
    assert.throws(() => digestTrustDocumentQrLink(bad, origin), /QR verification/);
  }
});

test('rejects malformed, shortened and noncanonical opaque tokens', () => {
  const { url } = createTrustDocumentQrLink(origin);
  const token = url.split('/').at(-1);
  for (const bad of [token.slice(0, 42), token + 'a', token.slice(0, 42) + '=',
    token.slice(0, 42) + '/', token.slice(0, 42) + '+',
    token.slice(0, 42) + 'B']) {
    assert.throws(() => digestTrustDocumentQrLink(`${origin}/verify/document/${bad}`, origin),
      /QR verification token|Noncanonical/);
  }
});

test('does not mutate URLs or return document metadata on token lookup', () => {
  const { url, tokenHashSha256 } = createTrustDocumentQrLink(origin);
  const digest = digestTrustDocumentQrLink(url, origin);
  assert.equal(typeof digest, 'string');
  assert.equal(digest.length, 64);
  assert.equal(digest, tokenHashSha256);
});
