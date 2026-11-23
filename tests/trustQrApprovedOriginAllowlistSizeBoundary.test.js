import test from 'node:test';
import assert from 'node:assert/strict';
import { requireApprovedQrOrigin } from '../server/services/trustDocumentQrApprovedOrigin.js';

const origin = 'https://verify.example.org';

test('approved QR origin configuration accepts exactly 128 distinct canonical entries', () => {
  const approved = Array.from({ length: 128 }, (_, index) =>
    index === 127 ? origin : `https://verify-${index}.example.org`);
  assert.equal(requireApprovedQrOrigin(origin, approved), origin);
});

test('approved QR origin configuration rejects 129 entries even if requested origin is first', () => {
  const approved = Array.from({ length: 129 }, (_, index) =>
    index === 0 ? origin : `https://verify-${index}.example.org`);
  assert.throws(
    () => requireApprovedQrOrigin(origin, approved),
    /Approved QR verification origin required/
  );
});

test('approved QR origin configuration rejects zero entries', () => {
  assert.throws(
    () => requireApprovedQrOrigin(origin, []),
    /Approved QR verification origin required/
  );
});
