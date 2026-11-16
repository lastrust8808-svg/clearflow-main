import test from 'node:test';
import assert from 'node:assert/strict';
import { requireApprovedQrOrigin } from '../server/services/trustDocumentQrApprovedOrigin.js';

const approved = 'https://verify.example.org';

test('QR approval validates every entry even after finding an exact match', () => {
  assert.throws(
    () => requireApprovedQrOrigin(approved, [approved, 'http://unsafe.example.org']),
    /origin|https|public|valid/i,
  );
});

test('QR approval rejects duplicate entries after an exact match', () => {
  assert.throws(
    () => requireApprovedQrOrigin(approved, [approved, 'https://other.example.org', approved]),
    /Duplicate approved QR verification origin/,
  );
});

test('QR approval does not execute accessor on a later allowlist entry', () => {
  let accessed = 0;
  const entries = [approved, 'https://other.example.org'];
  Object.defineProperty(entries, '1', {
    enumerable: true,
    configurable: true,
    get() { accessed++; throw new Error('untrusted getter executed'); },
  });
  assert.throws(
    () => requireApprovedQrOrigin(approved, entries),
    /Approved QR verification origin required/,
  );
  assert.equal(accessed, 0);
});
