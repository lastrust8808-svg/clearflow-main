import test from 'node:test';
import assert from 'node:assert/strict';
import { requireApprovedQrOrigin } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';

test('QR origin approval fails closed when proxy ownKeys inspection is denied', () => {
  let indexedReads = 0;
  const hostile = new Proxy([origin], {
    ownKeys() { throw new Error('ownKeys inspection denied'); },
    get(target, key, receiver) {
      if (key === '0') indexedReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => requireApprovedQrOrigin(origin, hostile),
    /ownKeys inspection denied/);
  assert.equal(indexedReads, 0);
});

test('QR origin approval rejects a proxy reporting extra hidden configuration keys', () => {
  let indexedReads = 0;
  const backing = [origin];
  Object.defineProperty(backing, 'hiddenApproval', { value: 'https://attacker.example.org', configurable: true });
  const hostile = new Proxy(backing, {
    get(target, key, receiver) {
      if (key === '0') indexedReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => requireApprovedQrOrigin(origin, hostile),
    /Approved QR verification origin required/);
  assert.equal(indexedReads, 0);
});
