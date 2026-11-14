import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovedTrustDocumentQrLink, digestApprovedTrustDocumentQrLink } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';
const approved = [origin];

test('QR lookup refuses parser-normalized route aliases and encoded separators', () => {
  const { url } = createApprovedTrustDocumentQrLink(origin, approved);
  const route = '/verify/document/';
  const invalid = [
    url.replace(route, '/verify/./document/'),
    url.replace(route, '/verify/other/../document/'),
    url.replace(route, '/verify/%64ocument/'),
    url.replace(route, '/verify/document%2f'),
    url.replace(route, '/verify//document/'),
    url.replace(origin, origin + ':443'),
    url.replace(origin, 'https://user@verify.example.org'),
    url + '#fragment',
    url + '?tenant=other',
  ];
  for (const candidate of invalid) {
    assert.throws(
      () => digestApprovedTrustDocumentQrLink(candidate, origin, approved),
      { name: 'TypeError' },
      'must reject noncanonical QR locator: ' + candidate.replace(/\/verify\/document\/[^/?#]+/, '/verify/document/[redacted]'),
    );
  }
});

test('QR origin approval rejects noncanonical lookalike origins before issuing locators', () => {
  for (const candidate of [
    'https://verify.example.org/',
    'https://VERIFY.example.org',
    'https://verify.example.org:443',
    'https://verify.example.org.evil.invalid',
    'http://verify.example.org',
    'https://verify.example.org@evil.example.net',
  ]) {
    assert.throws(() => createApprovedTrustDocumentQrLink(candidate, approved), { name: 'TypeError' });
  }
});
