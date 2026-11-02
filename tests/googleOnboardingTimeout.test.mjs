import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expirePendingGoogleSignIn, rejectFailedGoogleAuthorization, rejectUnverifiedGoogleOnboardingFallback } from '../src/domain/googleOnboardingTimeout.mjs';

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

test('remembered Google identity cannot silently restore an authenticated tenant workspace', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  // A remembered email may remain as a UI hint, but must not promote a local
  // Google match into an authenticated workspace on page load.
  assert.match(source, /LAST_GOOGLE_USER_STORAGE_KEY/);
  assert.match(source, /\blastKnownGoogleUser,\s*authStatus: state\.status/);
  assert.doesNotMatch(source, /restoreRememberedSession/);
  assert.doesNotMatch(source, /status:\s*getGoogleWorkspaceStatus\(mergedAppData,\s*lastKnownGoogleUser\)/);
  assert.doesNotMatch(source, /localAccountId:\s*localGoogleMatch\.userId,\s*appData:\s*mergedAppData/);
  // Explicit local credential flows must remain available for account recovery.
  assert.match(source, /authenticateLocalPassword\(/);
  assert.match(source, /verifyLocalAuthChallenge\(/);
});

for (const status of ['pending-gsi', 'pending-drive-check']) {
  test('failed OAuth callback rejects cached Google workspace in ' + status, () => {
    const current = Object.freeze({ ...pending('returning'), status });
    const next = rejectFailedGoogleAuthorization(current);
    assert.equal(next.status, 'unauthenticated');
    for (const key of [
      'appData', 'token', 'apiAccessToken', 'localAccountId', 'gsiUser',
      'pendingCredentialAuth', 'pendingGoogleMode',
    ]) assert.equal(next[key], null, key + ' must be cleared');
    assert.match(next.authMessage, /could not be verified/);
    assert.equal(next.otherUiState, 'preserve');
    assert.equal(current.status, status, 'previous state must not be mutated');
  });
}

test('late OAuth error cannot sign out a completed or unrelated session', () => {
  for (const status of ['authenticated', 'pending-profile-setup', 'pending-verification', 'unauthenticated']) {
    const current = Object.freeze({ ...pending('new'), status });
    assert.equal(rejectFailedGoogleAuthorization(current), current);
  }
  assert.equal(rejectFailedGoogleAuthorization(null), null);
});

test('OAuth callback and code-exchange failures both fail closed without cached-profile fallback', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const handleAuthorizationCodeResponse = useCallback(');
  const end = source.indexOf('const debouncedSave =', start);
  assert.ok(start >= 0 && end > start, 'OAuth callback must be present');
  const callback = source.slice(start, end);
  assert.match(callback, /if \(response\?\.error \|\| !response\?\.code\)/);
  assert.match(callback, /\.catch\(\(error\) => \{/);
  assert.equal(
    (callback.match(/setState\(\(current\) => rejectFailedGoogleAuthorization\(current\) as AuthState\)/g) || []).length,
    2,
    'both failure branches must reject the unverified session'
  );
  assert.doesNotMatch(callback, /canBypassProfileSetupForGoogleIdentity/);
  assert.doesNotMatch(callback, /pending-profile-setup|status:\s*'authenticated'/);
  assert.doesNotMatch(callback, /current\.appData\?\.user/);
});

for (const status of ['pending-gsi', 'pending-drive-check']) {
  for (const mode of ['new', 'existing', 'returning', null]) {
    test('manual Google fallback cannot create a workspace in ' + status + '/' + String(mode), () => {
      const current = Object.freeze({ ...pending(mode), status });
      const result = rejectUnverifiedGoogleOnboardingFallback(current);
      assert.equal(current.status, status, 'input must not be mutated');
      assert.equal(result.status, 'unauthenticated');
      for (const key of [
        'appData', 'token', 'apiAccessToken', 'localAccountId', 'gsiUser',
        'pendingCredentialAuth', 'pendingGoogleMode',
      ]) assert.equal(result[key], null, key + ' must not survive');
      assert.match(result.authMessage, /verification is incomplete/);
      assert.equal(result.otherUiState, 'preserve');
    });
  }
}

test('manual Google fallback cannot sign out an independently authenticated session', () => {
  for (const status of ['authenticated', 'pending-profile-setup', 'pending-verification', 'unauthenticated']) {
    const current = Object.freeze({ ...pending('new'), status });
    assert.equal(rejectUnverifiedGoogleOnboardingFallback(current), current);
  }
  assert.equal(rejectUnverifiedGoogleOnboardingFallback(null), null);
});

test('React manual onboarding continue uses fail-closed reducer and never cached identity', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const continueGoogleOnboardingFallback = () => {');
  const end = source.indexOf('const value: AuthContextType = {', start);
  assert.ok(start >= 0 && end > start, 'manual fallback callback must be bounded');
  const callback = source.slice(start, end);
  assert.match(callback, /rejectUnverifiedGoogleOnboardingFallback\(current\)/);
  assert.doesNotMatch(callback, /pending-profile-setup|buildProvisionalGoogleUser|lastKnownGoogleUser|current\.appData\?\.user/);
  assert.doesNotMatch(source, /const buildProvisionalGoogleUser =/);
});
