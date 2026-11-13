import test from 'node:test';
import assert from 'node:assert/strict';
import { requireApprovedQrOrigin } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';

test('QR approval rejects symbol metadata even when it is non-enumerable', () => {
  const configured = [origin];
  Object.defineProperty(configured, Symbol('unreviewed'), {
    value: 'https://attacker.example.org',
    enumerable: false,
  });
  assert.throws(() => requireApprovedQrOrigin(origin, configured),
    /Approved QR verification origin required/);
});

test('QR approval rejects sparse allowlists without reading inherited indexed values', () => {
  const configured = new Array(2);
  configured[0] = origin;
  const prototype = Object.create(Array.prototype);
  Object.defineProperty(prototype, '1', {
    get() { throw new Error('inherited indexed getter must not run'); },
  });
  Object.setPrototypeOf(configured, prototype);
  assert.throws(() => requireApprovedQrOrigin(origin, configured),
    /Approved QR verification origin required/);
});

test('QR approval ignores a hostile iterator and rejects duplicate descriptor values', () => {
  const configured = [origin, origin];
  let iterated = false;
  Object.defineProperty(configured, Symbol.iterator, {
    value() { iterated = true; return [origin][Symbol.iterator](); },
  });
  assert.throws(() => requireApprovedQrOrigin(origin, configured),
    /Approved QR verification origin required/);
  assert.equal(iterated, false);
});

test('QR approval enforces the bounded configuration size before reading indexed getters', () => {
  const configured = new Array(129);
  let accessed = false;
  Object.defineProperty(configured, '0', {
    get() { accessed = true; throw new Error('unexpected indexed access'); },
    enumerable: true,
  });
  assert.throws(() => requireApprovedQrOrigin(origin, configured),
    /Approved QR verification origin required/);
  assert.equal(accessed, false);
});

test('QR approval validates every entry, even after the requested origin matches', () => {
  const configured = [origin, 'http://untrusted.example.org'];
  assert.throws(() => requireApprovedQrOrigin(origin, configured));
});

test('QR approval rejects port and hostname variants without URL normalization', () => {
  assert.throws(() => requireApprovedQrOrigin(origin, ['https://verify.example.org:443']));
  assert.throws(() => requireApprovedQrOrigin(origin, ['https://VERIFY.example.org']));
});
