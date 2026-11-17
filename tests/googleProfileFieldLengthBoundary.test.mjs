import assert from 'node:assert/strict';
import test from 'node:test';
import { admitVerifiedGoogleProfile } from '../src/domain/googleOnboardingTimeout.mjs';

const pending = () => ({ status: 'pending-gsi', token: null });

test('oversized Google identity fields cannot advance workspace recovery', () => {
  const current = pending();
  const token = 'verified-provider-token';
  const base = { email: 'member@example.test', name: 'Member', id: 'subject' };
  for (const profile of [
    { ...base, email: 'x'.repeat(309) + '@example.test' },
    { ...base, name: 'N'.repeat(1025) },
    { ...base, id: 's'.repeat(256) },
  ]) {
    assert.equal(admitVerifiedGoogleProfile(current, token, profile), current);
  }
});

test('bounded Google identity fields remain eligible for pending recovery only', () => {
  const next = admitVerifiedGoogleProfile(pending(), 'verified-provider-token', {
    email: 'x'.repeat(307) + '@example.test',
    name: 'N'.repeat(1024),
    id: 's'.repeat(255),
  });
  assert.equal(next.status, 'pending-drive-check');
  assert.equal(next.token, null);
  assert.equal(next.appData.user.id.length, 255);
});
