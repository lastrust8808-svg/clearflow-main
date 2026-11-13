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


test('verified Google profile is detached from mutable provider payload', () => {
  const profile = { email: 'member@example.test', name: 'Member' };
  const next = admitVerifiedGoogleProfile(pending(), 'provider-token', profile);
  profile.email = 'attacker@example.test';
  profile.name = 'Changed';
  assert.equal(next.appData.user.email, 'member@example.test');
  assert.equal(next.appData.user.name, 'Member');
  assert.notEqual(next.appData.user, profile);
});

test('malformed provider display name cannot enter pending recovery', () => {
  const current = pending();
  assert.equal(admitVerifiedGoogleProfile(current, 'provider-token', { email: valid.email, name: 123 }), current);
  assert.equal(admitVerifiedGoogleProfile(current, 'provider-token', { email: valid.email, name: 'Bad\\u0000Name' }), current);
});

test('verified profile ID is detached and retained for pending workspace recovery', () => {
  const profile = { id: 'google-subject-123', email: valid.email, name: 'Member' };
  const next = admitVerifiedGoogleProfile(pending(), 'provider-token', profile);
  profile.id = 'attacker-subject';
  assert.equal(next.appData.user.id, 'google-subject-123');
  assert.equal(next.appData.user.email, valid.email);
});

test('malformed or accessor-backed profile IDs fail closed without executing getters', () => {
  const current = pending();
  let reads = 0;
  const accessor = { email: valid.email };
  Object.defineProperty(accessor, 'id', { get() { reads++; return 'stolen'; } });
  assert.equal(admitVerifiedGoogleProfile(current, 'provider-token', accessor), current);
  assert.equal(reads, 0);
  for (const id of ['', '  ', 42, 'bad\\u0000id', 'e\\u0301']) {
    assert.equal(admitVerifiedGoogleProfile(current, 'provider-token', { id, email: valid.email }), current);
  }
});
