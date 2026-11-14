import assert from 'node:assert/strict';
import test from 'node:test';
import { admitVerifiedGoogleProfile } from '../src/domain/googleOnboardingTimeout.mjs';

const pending = Object.freeze({
  status: 'pending-gsi',
  token: 'stale-app-session',
  apiAccessToken: null,
  appData: null,
});
const user = Object.freeze({ name: 'Example', email: 'verified@example.test' });

test('OAuth token admission rejects Unicode noncharacters across planes without mutating pending state', () => {
  for (const point of [0xFDD0, 0xFDEF, 0xFFFE, 0xFFFF, 0x1FFFE, 0x1FFFF, 0x10FFFE, 0x10FFFF]) {
    const token = 'opaque' + String.fromCodePoint(point) + 'token';
    assert.equal(admitVerifiedGoogleProfile(pending, token, user), pending, 'U+' + point.toString(16));
  }
  assert.equal(pending.token, 'stale-app-session');
});

test('valid opaque token still advances only to pending workspace recovery', () => {
  const next = admitVerifiedGoogleProfile(pending, 'opaque-token_123', user);
  assert.equal(next.status, 'pending-drive-check');
  assert.equal(next.token, null, 'OAuth profile alone cannot grant app session');
  assert.equal(next.apiAccessToken, 'opaque-token_123');
});
