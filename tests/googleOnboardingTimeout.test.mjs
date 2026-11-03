import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expirePendingGoogleSignIn, expirePendingGoogleDriveCheck, rejectFailedGoogleAuthorization, rejectUnverifiedGoogleOnboardingFallback, rejectFailedGoogleDriveRecovery, admitVerifiedGoogleProfile } from '../src/domain/googleOnboardingTimeout.mjs';

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

for (const mode of ['new', 'existing', 'returning', null]) {
  test('unverified Drive lookup timeout rejects cached workspace in ' + String(mode) + ' mode', () => {
    const current = Object.freeze({ ...pending(mode), status: 'pending-drive-check' });
    const result = expirePendingGoogleDriveCheck(current);
    assert.equal(current.status, 'pending-drive-check');
    assert.equal(result.status, 'unauthenticated');
    for (const key of [
      'appData', 'token', 'apiAccessToken', 'localAccountId', 'gsiUser',
      'pendingCredentialAuth', 'pendingGoogleMode',
    ]) assert.equal(result[key], null, key + ' must be cleared');
    assert.equal(result.otherUiState, 'preserve');
    assert.match(result.authMessage, /lookup timed out before verification/);
  });
}

test('late Drive timeout cannot invalidate completed or unrelated sessions', () => {
  for (const status of ['authenticated', 'pending-profile-setup', 'pending-verification', 'pending-gsi', 'unauthenticated']) {
    const current = Object.freeze({ ...pending('new'), status });
    assert.equal(expirePendingGoogleDriveCheck(current), current, status);
  }
  assert.equal(expirePendingGoogleDriveCheck(null), null);
});

test('React Drive lookup timeout cannot manufacture a profile or reuse cached identity', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const effectStart = source.indexOf("if (state.status !== 'pending-drive-check' || !state.gsiUser) {");
  assert.ok(effectStart >= 0, 'Drive lookup timeout effect must exist');
  const effectEnd = source.indexOf('  useEffect(() => {', effectStart);
  assert.ok(effectEnd > effectStart, 'Drive lookup timeout effect must be bounded');
  const effect = source.slice(effectStart, effectEnd);
  assert.match(effect, /expirePendingGoogleDriveCheck\(current\)/);
  assert.doesNotMatch(effect, /pending-profile-setup|newUser: User|findLocalAccountByGoogleEmail/);
});

test('late Drive recovery cannot overwrite a timed-out or independently changed session', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const pendingEmail = state.gsiUser?.email;');
  const end = source.indexOf("if (state.status !== 'pending-drive-check' || !state.gsiUser) {", start);
  assert.ok(start >= 0 && end > start, 'Drive recovery effect must be bounded');
  const effect = source.slice(start, end);
  assert.match(effect, /current.status !== 'pending-drive-check'/);
  assert.match(effect, /current.apiAccessToken !== pendingAccessToken/);
  assert.match(effect, /current.gsiUser\?\.email !== pendingEmail/);
  assert.equal((effect.match(/setPendingDriveState\(/g) || []).length, 5,
    'all five Drive lookup results must use the attempt-guarded state transition');
  assert.equal((effect.match(/setState\(/g) || []).length, 1,
    'only the guarded wrapper may call the raw React state setter');
});

for (const mode of ['new', 'existing', 'returning', null]) {
  test('failed Drive recovery rejects cached workspace for ' + String(mode) + ' sign-in', () => {
    const previous = Object.freeze({ ...pending(mode), status: 'pending-drive-check' });
    const result = rejectFailedGoogleDriveRecovery(previous);
    assert.equal(previous.status, 'pending-drive-check');
    assert.equal(result.status, 'unauthenticated');
    for (const key of ['appData', 'token', 'apiAccessToken', 'localAccountId',
      'gsiUser', 'pendingCredentialAuth', 'pendingGoogleMode']) {
      assert.equal(result[key], null, key + ' must be cleared after a failed lookup');
    }
    assert.match(result.authMessage, /workspace recovery failed/);
    assert.equal(result.otherUiState, 'preserve');
  });
}

test('late Drive recovery failure cannot sign out an unrelated completed session', () => {
  for (const status of ['authenticated', 'pending-profile-setup', 'pending-verification', 'pending-gsi', 'unauthenticated']) {
    const current = Object.freeze({ ...pending('new'), status });
    assert.equal(rejectFailedGoogleDriveRecovery(current), current);
  }
  assert.equal(rejectFailedGoogleDriveRecovery(null), null);
});

test('React Drive lookup exception fails closed rather than using local fallback or provisional enrollment', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf("console.error('Unable to verify Google workspace after sign-in:'");
  const end = source.indexOf('    checkDrive();', start);
  assert.ok(start >= 0 && end > start, 'Drive failure branch must be present');
  const failure = source.slice(start, end);
  assert.match(failure, /needsDriveCatchUpRef.current = false/);
  assert.match(failure, /setPendingDriveState\(\(current\) => rejectFailedGoogleDriveRecovery\(current\) as AuthState\)/);
  assert.doesNotMatch(failure, /findLocalAccountByGoogleEmail|pending-profile-setup|newAppData|status:\\s*'authenticated'/);
});


test('stale Drive recovery cannot mutate a local account cache before session admission', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const pendingEmail = state.gsiUser?.email;');
  const end = source.indexOf("if (state.status !== 'pending-drive-check' || !state.gsiUser) {", start);
  assert.ok(start >= 0 && end > start, 'Drive recovery effect must be bounded');
  const effect = source.slice(start, end);
  assert.match(effect, /loadAccountAppData\(localGoogleMatch\.userId\)/,
    'durable linked-account recovery must remain supported');
  assert.match(effect, /setPendingDriveState\(\(current\) => \(\{/,
    'recovered data must be admitted only through the pending-attempt guard');
  assert.doesNotMatch(effect, /saveLocalAuthAppData\(/,
    'an async response may not write local cache before its pending session is accepted');
});

test('verified Google profile is admitted only during an active pending sign-in', () => {
  const current = Object.freeze({ ...pending('returning'), status: 'pending-gsi', appData: null });
  const user = Object.freeze({ id: 'verified-id', name: 'Example User', email: 'verified@example.test' });
  const next = admitVerifiedGoogleProfile(current, 'fresh-access-token', user);
  assert.equal(next.status, 'pending-drive-check');
  assert.equal(next.apiAccessToken, 'fresh-access-token');
  assert.deepEqual(next.gsiUser, { name: 'Example User', email: 'verified@example.test' });
  assert.deepEqual(next.appData, { user, entities: [] });
  assert.equal(current.status, 'pending-gsi', 'reducer must not mutate input');
});

test('late Google profile cannot reopen a timed-out, logged-out or independently authenticated session', () => {
  const user = { id: 'late-id', name: 'Late', email: 'late@example.test' };
  for (const status of ['unauthenticated', 'authenticated', 'pending-drive-check', 'pending-profile-setup', 'pending-verification']) {
    const current = Object.freeze({ ...pending('new'), status });
    assert.equal(admitVerifiedGoogleProfile(current, 'late-token', user), current, status);
  }
  const waiting = Object.freeze({ ...pending('new'), status: 'pending-gsi' });
  for (const [token, profile] of [
    ['', user],
    ['   ', user],
    [null, user],
    ['valid-token', null],
    ['valid-token', { name: 'No Email' }],
    ['valid-token', { email: '   ' }],
  ]) {
    assert.equal(admitVerifiedGoogleProfile(waiting, token, profile), waiting);
  }
});

test('React OAuth hydration uses guarded admission and cannot mutate active Drive email first', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const hydrateGoogleAccessSession = useCallback(');
  const end = source.indexOf('const exchangeGoogleAuthorizationCode = useCallback(', start);
  assert.ok(start >= 0 && end > start, 'Google hydration must be bounded');
  const hydrate = source.slice(start, end);
  assert.match(hydrate, /admitVerifiedGoogleProfile\(current, accessToken, provisionalUser\)/);
  assert.doesNotMatch(hydrate, /userDataService\.setActiveUserEmail\(/);
  assert.doesNotMatch(hydrate, /status:\s*'pending-drive-check'/);
});

test('Drive catch-up never writes provisional or unauthenticated Google workspaces', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('!needsDriveCatchUpRef.current ||');
  const end = source.indexOf('void userDataService', start);
  assert.ok(start >= 0 && end > start, 'Drive catch-up effect must be bounded');
  const effect = source.slice(start, end);
  assert.match(effect, /state.status !== 'authenticated'/,
    'only an admitted authenticated workspace may trigger the catch-up write');
  assert.match(effect, /needsDriveCatchUpRef.current = false/,
    'catch-up flag must be consumed before the asynchronous write');
});


test('Google profile admission rejects malformed and noncanonical email identities', () => {
  const waiting = Object.freeze({ ...pending('new'), status: 'pending-gsi' });
  const invalid = ['missing-at.example', 'a@@example.test', 'a@example', ' a@example.test',
    'a@example.test ', 'a\nb@example.test', 'a\u200bb@example.test', 'e\u0301@example.test'];
  for (const email of invalid) {
    assert.equal(admitVerifiedGoogleProfile(waiting, 'valid-access-token', { email, name: 'Test' }), waiting, email);
  }
  const accepted = admitVerifiedGoogleProfile(waiting, 'valid-access-token',
    { email: 'valid.user@example.test', name: 'Test' });
  assert.equal(accepted.status, 'pending-drive-check');
});


test('Google onboarding does not authenticate when Drive and local backup both fail', () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf("console.warn('Unable to complete Google onboarding fallback after Drive save error.'");
  const end = source.indexOf('\n            });', start);
  assert.ok(start >= 0 && end > start, 'failed backup branch must be present');
  const failedBackup = source.slice(start, end);
  assert.match(failedBackup, /status:\s*'unauthenticated'/);
  assert.match(failedBackup, /apiAccessToken:\s*null/);
  assert.match(failedBackup, /appData:\s*null/);
  assert.match(failedBackup, /authMessage:\s*'Workspace setup could not be saved/);
  assert.doesNotMatch(failedBackup, /status:\s*'authenticated'/);
  assert.doesNotMatch(failedBackup, /clearStoredMembershipDraft\(/);
});
