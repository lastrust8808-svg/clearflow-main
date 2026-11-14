import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovedTrustDocumentQrLink, digestApprovedTrustDocumentQrLink } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';
const approved = [origin];
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

test('every noncanonical trailing-sextet alias is rejected while the issued QR token resolves', () => {
  for (let sample = 0; sample < 16; sample++) {
    const { url, tokenHashSha256 } = createApprovedTrustDocumentQrLink(origin, approved);
    const token = url.slice(-43);
    const lastIndex = alphabet.indexOf(token.at(-1));
    assert.equal(token.length, 43);
    assert.ok(lastIndex >= 0);
    assert.equal(lastIndex & 15, 0, '32-byte base64url encoding must have four zero pad bits');
    assert.equal(digestApprovedTrustDocumentQrLink(url, origin, approved), tokenHashSha256);
    const canonicalBytes = Buffer.from(token, 'base64url').toString('hex');
    for (let lowBits = 1; lowBits < 16; lowBits++) {
      const alias = token.slice(0, -1) + alphabet[lastIndex | lowBits];
      assert.equal(Buffer.from(alias, 'base64url').toString('hex'), canonicalBytes);
      assert.throws(
        () => digestApprovedTrustDocumentQrLink(url.slice(0, -43) + alias, origin, approved),
        { name: 'TypeError' },
        'noncanonical trailing bits must not resolve to the same document'
      );
    }
  }
});
