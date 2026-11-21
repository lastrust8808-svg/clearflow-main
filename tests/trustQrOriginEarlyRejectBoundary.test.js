import test from 'node:test';
import assert from 'node:assert/strict';
import { requireApprovedQrOrigin } from '../server/services/trustDocumentQrApprovedOrigin.js';

const approved = 'https://verify.example.org';

test('malformed origin is rejected before inspecting untrusted allowlist proxies', () => {
  let traps = 0;
  const hostile = new Proxy([approved], {
    getOwnPropertyDescriptor() { traps++; throw new Error('configuration inspected'); },
    ownKeys() { traps++; throw new Error('configuration enumerated'); },
    get() { traps++; throw new Error('configuration read'); },
  });
  for (const candidate of [null, undefined, {}, ['https://verify.example.org'], 42, new String(approved)]) {
    assert.throws(() => requireApprovedQrOrigin(candidate, hostile),
      /Approved QR verification origin required/);
  }
  assert.equal(traps, 0);
});

test('approved origin check does not execute a hostile array length getter', () => {
  let reads = 0;
  const config = new Proxy([approved], {
    get(target, key, receiver) {
      if (key === 'length') { reads++; throw new Error('length getter executed'); }
      return Reflect.get(target, key, receiver);
    },
  });
  assert.equal(requireApprovedQrOrigin(approved, config), approved);
  assert.equal(reads, 0);
});

test('invalid string origins fail before inspecting allowlist configuration', () => {
  let traps = 0;
  const hostile = new Proxy(['https://verify.example.org'], {
    getOwnPropertyDescriptor() { traps++; throw new Error('configuration inspected'); },
    ownKeys() { traps++; throw new Error('configuration enumerated'); },
    get() { traps++; throw new Error('configuration read'); },
  });
  for (const candidate of [
    '', 'http://verify.example.org', 'https://verify.example.org/path',
    'https://user@verify.example.org', 'https://verify.example.org:444',
  ]) {
    assert.throws(() => requireApprovedQrOrigin(candidate, hostile));
  }
  assert.equal(traps, 0);
});
