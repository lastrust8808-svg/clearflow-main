import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { digestTrustDocumentQrLink } from '../server/services/trustDocumentQrPolicy.js';

const origin = 'https://verify.example.org';
const route = origin + '/verify/document/';

test('QR lookup rejects noncanonical base64url pad-bit aliases of the same 256-bit token', () => {
  // 32 bytes produce 43 base64url characters; only the high four bits of
  // the last character carry data. Altering its low two bits can otherwise
  // create distinct URLs that decode to identical bytes and digest keys.
  const bytes = Buffer.alloc(32, 0x42);
  const canonical = bytes.toString('base64url');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = alphabet.indexOf(canonical.at(-1));
  assert.equal(canonical.length, 43);
  assert.equal(last % 4, 0);
  const expectedHash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(digestTrustDocumentQrLink(route + canonical, origin), expectedHash);

  for (let offset = 1; offset <= 3; offset++) {
    const alias = canonical.slice(0, -1) + alphabet[last + offset];
    assert.equal(Buffer.from(alias, 'base64url').equals(bytes), true);
    assert.throws(() => digestTrustDocumentQrLink(route + alias, origin),
      /Noncanonical QR verification token/);
  }
});
