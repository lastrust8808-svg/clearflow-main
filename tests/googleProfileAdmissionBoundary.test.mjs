import assert from 'node:assert/strict';
import test from 'node:test';
import { admitVerifiedGoogleProfile } from '../src/domain/googleOnboardingTimeout.mjs';

const pending = () => ({ status: 'pending-gsi', appData: { user: { email: 'old@example.test' } }, token: 'old-token' });
const valid = { email: 'member@example.test', name: 'Member' };

test('ordinary Google profile advances only to pending workspace recovery', () => {
  const next = admitVerifiedGoogleProfile(pending(), 'provider-token', valid);
  assert.equal(next.status, 'pending-drive-check');
  assert.equal(next.token, null);
  assert.equal(next.gsiUser.email, valid.email);
});

test('accessor-backed Google profile cannot execute getters or advance onboarding', () => {
  let reads = 0;
  const malicious = {};
  Object.defineProperty(malicious, 'email', { enumerable: true, get() { reads++; return 'member@example.test'; } });
  const current = pending();
  assert.equal(admitVerifiedGoogleProfile(current, 'provider-token', malicious), current);
  assert.equal(reads, 0);
  const nameGetter = { email: valid.email };
  Object.defineProperty(nameGetter, 'name', { enumerable: true, get() { reads++; return 'Member'; } });
  assert.equal(admitVerifiedGoogleProfile(current, 'provider-token', nameGetter), current);
  assert.equal(reads, 0);
});

test('proxy and inherited Google identity cannot establish profile admission', () => {
  const current = pending();
  assert.equal(admitVerifiedGoogleProfile(current, 'provider-token', new Proxy(valid, {})), current);
  assert.equal(admitVerifiedGoogleProfile(current, 'provider-token', Object.create({ email: valid.email })), current);
  assert.equal(admitVerifiedGoogleProfile(current, 'provider-token', new Date()), current);
});
