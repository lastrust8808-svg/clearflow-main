import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStorageSegment } from '../server/utils/storageSegment.js';

// Unicode noncharacters include both the BMP block and the final two
// code points of every plane. Reject them before creating tenant paths.
test('Unicode noncharacters are rejected on every Unicode plane', () => {
  for (let plane = 0; plane <= 16; plane += 1) {
    for (const suffix of [0xfffe, 0xffff]) {
      const codePoint = plane * 0x10000 + suffix;
      assert.throws(
        () => sanitizeStorageSegment('tenant-' + String.fromCodePoint(codePoint)),
        TypeError,
        'noncharacter U+' + codePoint.toString(16)
      );
    }
  }
  for (const codePoint of [0xfdd0, 0xfdef]) {
    assert.throws(() => sanitizeStorageSegment(String.fromCodePoint(codePoint)), TypeError);
  }
});

test('valid supplementary-plane identifiers remain distinct and encoded', () => {
  const identifiers = ['tenant-😀', 'tenant-😁', 'tenant-𐀀'];
  const encoded = identifiers.map(sanitizeStorageSegment);
  assert.equal(new Set(encoded).size, identifiers.length);
  for (let index = 0; index < identifiers.length; index += 1) {
    assert.equal(encoded[index], encodeURIComponent(identifiers[index]));
  }
});
