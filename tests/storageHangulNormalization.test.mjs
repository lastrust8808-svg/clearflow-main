import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStorageSegment } from '../server/utils/storageSegment.js';

// NFC is not limited to Latin combining marks: Hangul Jamo sequences also
// normalize into precomposed syllables. Refuse alternate spellings rather than
// silently assigning them separate account storage identities.
test('Hangul canonical decomposition cannot create a second tenant storage identity', () => {
  const composed = '\uAC00'; // 가
  const decomposed = '\u1100\u1161'; // ᄀ + ᅡ
  assert.equal(decomposed.normalize('NFC'), composed);
  assert.notEqual(decomposed, composed);
  assert.equal(sanitizeStorageSegment('tenant-' + composed), encodeURIComponent('tenant-' + composed));
  assert.throws(() => sanitizeStorageSegment('tenant-' + decomposed), TypeError);
  assert.throws(() => sanitizeStorageSegment(decomposed), TypeError);
});

test('canonical Hangul identifiers remain stable and distinct after percent encoding', () => {
  const identifiers = ['tenant-가', 'tenant-각', 'tenant-나', 'tenant-한'];
  const segments = identifiers.map(sanitizeStorageSegment);
  assert.equal(new Set(segments).size, identifiers.length);
  for (let i = 0; i < identifiers.length; i += 1) {
    assert.equal(segments[i], encodeURIComponent(identifiers[i]));
  }
});
