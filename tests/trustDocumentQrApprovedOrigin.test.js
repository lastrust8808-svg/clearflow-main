import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requireApprovedQrOrigin,
  createApprovedTrustDocumentQrLink,
  digestApprovedTrustDocumentQrLink,
} from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';
const allowlist = Object.freeze([origin]);

test('approved QR origin issues and resolves an opaque token without metadata', () => {
  const link = createApprovedTrustDocumentQrLink(origin, allowlist);
  assert.equal(digestApprovedTrustDocumentQrLink(link.url, origin, allowlist), link.tokenHashSha256);
  assert.deepEqual(Object.keys(link), ['url', 'tokenHashSha256']);
});

test('untrusted and absent allowlists fail closed for issuance and lookup', () => {
  const link = createApprovedTrustDocumentQrLink(origin, allowlist);
  for (const config of [undefined, null, [], {}, origin, [null], [origin, 3]]) {
    assert.throws(() => createApprovedTrustDocumentQrLink(origin, config), /Approved QR verification origin/);
    assert.throws(() => digestApprovedTrustDocumentQrLink(link.url, origin, config), /Approved QR verification origin/);
  }
});

test('origin authorization uses exact allowlist membership, never suffix matching', () => {
  const link = createApprovedTrustDocumentQrLink(origin, allowlist);
  for (const candidate of [
    'https://evilverify.example.org',
    'https://verify.example.org.evil.net',
    'https://VERIFY.example.org',
    'https://verify.example.org/',
    'https://verify.example.org:8443',
    'http://verify.example.org',
  ]) {
    assert.throws(() => requireApprovedQrOrigin(candidate, allowlist), /Unapproved QR verification origin/);
    assert.throws(() => createApprovedTrustDocumentQrLink(candidate, allowlist), /Unapproved QR verification origin/);
    assert.throws(() => digestApprovedTrustDocumentQrLink(link.url, candidate, allowlist), /Unapproved QR verification origin/);
  }
});

test('QR origin allowlist rejects sparse and accessor-backed entries without evaluating getters', () => {
  const sparse = new Array(1);
  const accessor = [];
  let getterCalls = 0;
  Object.defineProperty(accessor, '0', {
    enumerable: true,
    get() { getterCalls++; return origin; },
  });
  const inherited = new Array(1);
  Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype), { 0: origin }));
  for (const config of [sparse, accessor, inherited, Array(129).fill(origin)]) {
    assert.throws(() => requireApprovedQrOrigin(origin, config), /Approved QR verification origin/);
  }
  assert.equal(getterCalls, 0);
  assert.equal(requireApprovedQrOrigin(origin, allowlist), origin);
});

test('QR origin authorization ignores overridden array membership methods', () => {
  const malicious = [origin];
  Object.defineProperty(malicious, 'includes', { value: () => true });
  assert.throws(
    () => requireApprovedQrOrigin('https://attacker.example.org', malicious),
    /Unapproved QR verification origin/,
  );
  assert.equal(requireApprovedQrOrigin(origin, malicious), origin);
  const inherited = [origin];
  Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype), {
    includes: () => true,
  }));
  assert.throws(
    () => requireApprovedQrOrigin('https://attacker.example.org', inherited),
    /Unapproved QR verification origin/,
  );
});


test('approved QR origin configuration rejects malformed unused destinations', () => {
  for (const invalid of [
    'http://unsafe.example.org',
    'https://localhost',
    'https://admin.internal',
    'https://verify.example.org:8443',
    'https://verify.example.org/path',
  ]) {
    assert.throws(() => requireApprovedQrOrigin(origin, [origin, invalid]), /origin required/);
  }
  assert.equal(requireApprovedQrOrigin(origin, [origin, 'https://second.example.org']), origin);
});
