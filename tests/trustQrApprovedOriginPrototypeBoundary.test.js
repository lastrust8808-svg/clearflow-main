import test from 'node:test';
import assert from 'node:assert/strict';
import { requireApprovedQrOrigin } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.com';

test('rejects origin allowlists with altered or subclass prototypes', () => {
  const inherited = [origin];
  Object.setPrototypeOf(inherited, Object.create(Array.prototype));
  assert.throws(() => requireApprovedQrOrigin(origin, inherited), /Approved QR verification origin required/);

  class OriginList extends Array {}
  assert.throws(() => requireApprovedQrOrigin(origin, new OriginList(origin)), /Approved QR verification origin required/);
  assert.equal(requireApprovedQrOrigin(origin, [origin]), origin);
});

test('rejects a proxy whose prototype inspection fails without reading entries', () => {
  let readIndex = false;
  const hostile = new Proxy([origin], {
    getPrototypeOf() { throw new Error('prototype inspection blocked'); },
    get(target, key, receiver) {
      if (key === '0') readIndex = true;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => requireApprovedQrOrigin(origin, hostile), /prototype inspection blocked/);
  assert.equal(readIndex, false);
});
