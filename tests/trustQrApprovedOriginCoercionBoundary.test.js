import test from 'node:test';
import assert from 'node:assert/strict';
import { requireApprovedQrOrigin } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';

test('QR approval rejects coercible origin objects without invoking caller hooks', () => {
  let calls = 0;
  const candidate = {
    toString() { calls++; return origin; },
    valueOf() { calls++; return origin; },
    [Symbol.toPrimitive]() { calls++; return origin; },
  };
  assert.throws(() => requireApprovedQrOrigin(candidate, [origin]), /Approved QR verification origin required/);
  assert.equal(calls, 0);
});

test('QR approval rejects non-array iterable configuration without invoking iterator', () => {
  let calls = 0;
  const config = {
    [Symbol.iterator]() { calls++; throw new Error('untrusted iterator executed'); },
    0: origin,
    length: 1,
  };
  assert.throws(() => requireApprovedQrOrigin(origin, config), /Approved QR verification origin required/);
  assert.equal(calls, 0);
});

test('QR approval refuses boxed string configuration entries without coercion', () => {
  let calls = 0;
  const entry = new String(origin);
  entry.toString = () => { calls++; throw new Error('untrusted coercion executed'); };
  assert.throws(() => requireApprovedQrOrigin(origin, [entry]), /Approved QR verification origin required/);
  assert.equal(calls, 0);
});
