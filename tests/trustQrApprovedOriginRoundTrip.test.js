import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovedTrustDocumentQrLink, digestApprovedTrustDocumentQrLink } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';
const approved = [origin];

test('approved QR issuance and lookup round-trip only through the pinned origin', () => {
  const issued = createApprovedTrustDocumentQrLink(origin, approved);
  assert.match(issued.url, /^https:\/\/verify\.example\.org\/verify\/document\/[A-Za-z0-9_-]{43}$/);
  assert.match(issued.tokenHashSha256, /^[a-f0-9]{64}$/);
  assert.equal(digestApprovedTrustDocumentQrLink(issued.url, origin, approved), issued.tokenHashSha256);
  assert.equal(issued.url.includes(issued.tokenHashSha256), false);
  assert.equal(Object.isFrozen(issued), true);
});

test('approved QR lookup refuses unapproved origins even for an otherwise valid issued link', () => {
  const issued = createApprovedTrustDocumentQrLink(origin, approved);
  assert.throws(() => digestApprovedTrustDocumentQrLink(issued.url, origin, ['https://other.example.org']),
    /Unapproved QR verification origin/);
  assert.throws(() => digestApprovedTrustDocumentQrLink(issued.url, 'https://other.example.org', approved),
    /Unapproved QR verification origin/);
});

test('approved QR lookup rejects token and route tampering without changing registry state', () => {
  const issued = createApprovedTrustDocumentQrLink(origin, approved);
  const tokenStart = issued.url.lastIndexOf('/') + 1;
  const changed = issued.url.slice(0, tokenStart) + (issued.url[tokenStart] === 'A' ? 'B' : 'A') + issued.url.slice(tokenStart + 1);
  assert.notEqual(digestApprovedTrustDocumentQrLink(changed, origin, approved), issued.tokenHashSha256);
  assert.throws(() => digestApprovedTrustDocumentQrLink(issued.url + '?x=1', origin, approved));
  assert.throws(() => digestApprovedTrustDocumentQrLink(issued.url.replace('/verify/document/', '/verify/other/'), origin, approved));
});

test('approved QR gate fails closed on hostile configuration enumeration without issuing a token', () => {
  let indexedReads = 0;
  const hostile = new Proxy([origin], {
    get(target, key, receiver) {
      if (key === '0') indexedReads++;
      return Reflect.get(target, key, receiver);
    },
    ownKeys() {
      throw new TypeError('configuration enumeration failed');
    },
  });
  assert.throws(() => createApprovedTrustDocumentQrLink(origin, hostile),
    /configuration enumeration failed/);
  assert.equal(indexedReads, 0);
});

test('approved QR gate refuses an accessor-backed unused allowlist entry', () => {
  let executed = false;
  const hostile = [origin, 'https://other.example.org'];
  Object.defineProperty(hostile, '1', {
    enumerable: true, configurable: true,
    get() { executed = true; throw new Error('must not execute'); },
  });
  assert.throws(() => createApprovedTrustDocumentQrLink(origin, hostile),
    /Approved QR verification origin required/);
  assert.equal(executed, false);
});
