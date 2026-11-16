import test from 'node:test';
import assert from 'node:assert/strict';
import { requireApprovedQrOrigin } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';

test('approved-origin authorization ignores hostile inherited collection helpers', () => {
  let executed = 0;
  const approved = [origin];
  const hostilePrototype = Object.create(Array.prototype);
  for (const key of ['includes', 'indexOf', 'some', 'find', 'values', Symbol.iterator]) {
    Object.defineProperty(hostilePrototype, key, {
      configurable: true,
      get() {
        executed++;
        throw new Error('Untrusted inherited collection helper executed');
      }
    });
  }
  Object.setPrototypeOf(approved, hostilePrototype);
  assert.equal(requireApprovedQrOrigin(origin, approved), origin);
  assert.equal(executed, 0);
});

test('approved-origin authorization never invokes inherited numeric getters for holes', () => {
  let executed = 0;
  const approved = new Array(1);
  const hostilePrototype = Object.create(Array.prototype);
  Object.defineProperty(hostilePrototype, '0', {
    configurable: true,
    get() {
      executed++;
      throw new Error('Inherited origin getter executed');
    }
  });
  Object.setPrototypeOf(approved, hostilePrototype);
  assert.throws(() => requireApprovedQrOrigin(origin, approved), /Approved QR verification origin required/);
  assert.equal(executed, 0);
});
