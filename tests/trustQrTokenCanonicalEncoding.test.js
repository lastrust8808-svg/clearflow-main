import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovedTrustDocumentQrLink, digestApprovedTrustDocumentQrLink } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';
const approved = [origin];

test('QR token rejects alternate base64url spellings of the same 32 bytes', () => {
  const { url, tokenHashSha256 } = createApprovedTrustDocumentQrLink(origin, approved);
  const token = url.slice(url.lastIndexOf('/') + 1);
  assert.equal(token.length, 43);
  assert.equal(digestApprovedTrustDocumentQrLink(url, origin, approved), tokenHashSha256);
  // For 32 bytes the last base64url sextet has four unused low bits.
  // Altering those bits can decode to the same bytes but must never create
  // a second accepted locator for the same stored digest.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const finalIndex = alphabet.indexOf(token.at(-1));
  assert.notEqual(finalIndex, -1);
  const alias = token.slice(0, -1) + alphabet[finalIndex ^ 1];
  assert.notEqual(alias, token);
  assert.equal(Buffer.from(alias, 'base64url').toString('hex'), Buffer.from(token, 'base64url').toString('hex'));
  assert.throws(() => digestApprovedTrustDocumentQrLink(url.slice(0, -43) + alias, origin, approved), {
    name: 'TypeError',
  });
});

test('QR token rejects padding, standard-base64 alphabet and truncated locators', () => {
  const { url } = createApprovedTrustDocumentQrLink(origin, approved);
  const token = url.slice(-43);
  for (const altered of [token + '=', token.slice(1), token + 'A', token.replace(/-/g, '+').replace(/_/g, '/') + '=']) {
    if (altered === token) continue;
    assert.throws(() => digestApprovedTrustDocumentQrLink(url.slice(0, -43) + altered, origin, approved), {
      name: 'TypeError',
    });
  }
});
