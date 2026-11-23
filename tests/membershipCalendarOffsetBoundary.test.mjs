import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMembershipInstants, parseMembershipInstant } from '../src/domain/membershipEntitlements.mjs';

// Synthetic clock-only acceptance tests. These do not authenticate a billing provider.
test('leap-day calendar validation rejects normalized invalid dates', () => {
  assert.equal(parseMembershipInstant('2024-02-29T23:59:59Z'), Date.parse('2024-02-29T23:59:59Z'));
  for (const invalid of [
    '2023-02-29T12:00:00Z',
    '2024-02-30T12:00:00Z',
    '2024-04-31T12:00:00Z',
    '2024-02-29T24:00:00Z',
    '2024-02-29T12:60:00Z',
    '2024-02-29T12:00:60Z',
    '2024-02-29T12:00:00+14:01',
    '2024-02-29T12:00:00-14:01',
    '2024-02-29T12:00:00+15:00',
  ]) {
    assert.throws(() => parseMembershipInstant(invalid), /timestamp/, invalid);
  }
});

test('equivalent leap-day instants compare equally across valid extreme offsets', () => {
  assert.equal(compareMembershipInstants('2024-02-29T12:00:00.0000001+14:00',
    '2024-02-28T22:00:00.0000001Z'), 0);
  assert.equal(compareMembershipInstants('2024-02-29T12:00:00.0000001-14:00',
    '2024-03-01T02:00:00.0000001Z'), 0);
  assert.equal(compareMembershipInstants('2024-02-29T12:00:00.0000002+14:00',
    '2024-02-28T22:00:00.0000001Z'), 1);
});
