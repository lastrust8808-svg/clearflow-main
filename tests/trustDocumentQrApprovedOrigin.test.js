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

test('approved QR origin configuration rejects duplicate entries', () => {
  assert.throws(
    () => requireApprovedQrOrigin(origin, [origin, origin]),
    /Duplicate approved QR verification origin/,
  );
  assert.equal(requireApprovedQrOrigin(origin, [origin, 'https://second.example.org']), origin);
});


test('duplicate QR origin detection does not trust an overridden array iterator', () => {
  const malicious = [origin, origin];
  let iteratorCalls = 0;
  Object.defineProperty(malicious, Symbol.iterator, {
    value: function* () { iteratorCalls++; yield 'https://other.example.org'; },
  });
  assert.throws(() => requireApprovedQrOrigin(origin, malicious),
    /Duplicate approved QR verification origin/);
  assert.equal(iteratorCalls, 0);
  const distinct = [origin, 'https://second.example.org'];
  Object.defineProperty(distinct, Symbol.iterator, {
    value: () => { throw new Error('iterator must not execute'); },
  });
  assert.equal(requireApprovedQrOrigin(origin, distinct), origin);
});


test('QR allowlist authorization uses validated descriptors, not proxy index reads', () => {
  let indexedReads = 0;
  const disguised = new Proxy([origin], {
    get(target, key, receiver) {
      if (key === '0') { indexedReads++; return 'https://attacker.example.org'; }
      return Reflect.get(target, key, receiver);
    },
  });
  assert.equal(requireApprovedQrOrigin(origin, disguised), origin);
  assert.throws(() => requireApprovedQrOrigin('https://attacker.example.org', disguised),
    /Unapproved QR verification origin/);
  assert.equal(indexedReads, 0);
});


test('QR allowlist rejects forged proxy length without indexed reads', () => {
  let indexReads = 0;
  const hiddenInvalid = new Proxy([origin, 'http://unsafe.example.org'], {
    get(target, key, receiver) {
      if (key === 'length') return 1;
      if (key === '0' || key === '1') indexReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => requireApprovedQrOrigin(origin, hiddenInvalid), /origin required/);
  assert.equal(indexReads, 0);
  const hiddenDuplicate = new Proxy([origin, origin], {
    get(target, key, receiver) {
      if (key === 'length') return 1;
      if (key === '0' || key === '1') indexReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => requireApprovedQrOrigin(origin, hiddenDuplicate),
    /Duplicate approved QR verification origin/);
  assert.equal(indexReads, 0);
});
