import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovedTrustDocumentQrLink, digestApprovedTrustDocumentQrLink } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';
const approved = [origin];

test('QR digest rejects URL parser authority and path normalization aliases', () => {
  const issued = createApprovedTrustDocumentQrLink(origin, approved);
  const token = issued.url.slice(-43);
  const aliases = [
    'https://VERIFY.example.org/verify/document/' + token,
    'https://verify.example.org:443/verify/document/' + token,
    'https://verify.example.org/verify/./document/' + token,
    'https://verify.example.org/verify/other/../document/' + token,
    'https://verify.example.org\\verify\\document\\' + token,
    'https://verify.example.org/verify/%64ocument/' + token,
    'https://verify.example.org/verify/document/%' + '41' + token.slice(1),
    issued.url + '#',
    issued.url + '?',
  ];
  assert.equal(digestApprovedTrustDocumentQrLink(issued.url, origin, approved), issued.tokenHashSha256);
  for (const alias of aliases) {
    assert.notEqual(alias, issued.url);
    assert.throws(() => digestApprovedTrustDocumentQrLink(alias, origin, approved), TypeError, alias);
  }
});

test('QR origin approval rejects parser-normalized authority aliases', () => {
  for (const alias of [
    'https://VERIFY.example.org',
    'https://verify.example.org:443',
    'https://verify.example.org.',
    'https://verify.example.org/',
    'https://verify.example.org\\',
  ]) {
    assert.throws(() => createApprovedTrustDocumentQrLink(alias, approved), TypeError, alias);
  }
});
