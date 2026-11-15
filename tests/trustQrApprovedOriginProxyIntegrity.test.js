import test from 'node:test';
import assert from 'node:assert/strict';
import { requireApprovedQrOrigin } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';

test('QR origin approval rejects duplicate ownKeys reports without reading indexed values', () => {
  let indexedReads = 0;
  const approvals = new Proxy([origin], {
    ownKeys() { return ['0', '0', 'length']; },
    get(target, key, receiver) {
      if (key === '0') indexedReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => requireApprovedQrOrigin(origin, approvals), TypeError);
  assert.equal(indexedReads, 0);
});

test('QR origin approval rejects revoked configuration proxies', () => {
  const { proxy, revoke } = Proxy.revocable([origin], {});
  revoke();
  assert.throws(() => requireApprovedQrOrigin(origin, proxy), TypeError);
});

test('QR origin approval rejects a proxy hiding a required indexed key', () => {
  let indexedReads = 0;
  const approvals = new Proxy([origin], {
    ownKeys() { return ['length']; },
    get(target, key, receiver) {
      if (key === '0') indexedReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => requireApprovedQrOrigin(origin, approvals), TypeError);
  assert.equal(indexedReads, 0);
});
