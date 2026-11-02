import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expirePendingGoogleSignIn } from '../src/domain/googleOnboardingTimeout.mjs';

const pending = (mode) => ({
  status: 'pending-gsi', pendingGoogleMode: mode,
  token: 'old-token', apiAccessToken: 'old-api-token', localAccountId: 'old-local-account',
  appData: { user: { id: 'remembered-google-account', email: 'old@example.test' } },
  gsiUser: { email: 'old@example.test' }, pendingCredentialAuth: { code: 'old' },
  authMessage: null, otherUiState: 'preserve',
});

for (const mode of ['new', 'existing', 'returning', null]) {
  test('unconfirmed ' + String(mode) + ' Google popup cannot manufacture a workspace', () => {
    const original = Object.freeze(pending(mode));
    const result = expirePendingGoogleSignIn(original);
    assert.equal(original.status, 'pending-gsi', 'reducer must not mutate prior state');
    assert.equal(result.status, 'unauthenticated');
    for (const key of [
      'token', 'apiAccessToken', 'localAccountId', 'appData', 'gsiUser',
      'pendingCredentialAuth', 'pendingGoogleMode',
    ]) assert.equal(result[key], null, key + ' must not survive an unconfirmed OAuth attempt');
    assert.equal(result.otherUiState, 'preserve');
    assert.match(result.authMessage, mode === 'new' ? /could not confirm your Google identity/ : /did not complete/);
    assert.notEqual(result, original);
  });
}

test('timeout cannot change a completed or already-aborted sign-in', () => {
  for (const status of ['authenticated', 'pending-profile-setup', 'pending-drive-check', 'unauthenticated']) {
    const state = Object.freeze({ ...pending('new'), status });
    assert.equal(expirePendingGoogleSignIn(state), state, status);
  }
  assert.equal(expirePendingGoogleSignIn(null), null);
});

test('React pending-GSI timeout is wired to fail-closed reducer, not remembered identity', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const effectStart = source.indexOf("if (state.status !== 'pending-gsi')");
  assert.notEqual(effectStart, -1, 'pending-GSI timeout effect must exist');
  const effectEnd = source.indexOf('  useEffect(() => {', effectStart);
  assert.notEqual(effectEnd, -1, 'pending-GSI effect must be bounded');
  const timeoutEffect = source.slice(effectStart, effectEnd);
  assert.match(timeoutEffect, /setState\(\(current\) => expirePendingGoogleSignIn\(current\) as AuthState\)/);
  assert.doesNotMatch(timeoutEffect, /const fallbackIdentity = current\.gsiUser \|\| lastKnownGoogleUser/);
  assert.doesNotMatch(timeoutEffect, /current\.appData\?\.user \|\| buildProvisionalGoogleUser\(fallbackIdentity\)/);
});
