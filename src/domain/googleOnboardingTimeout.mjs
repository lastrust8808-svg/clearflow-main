/**
 * Resolve a Google OAuth popup timeout without manufacturing a membership.
 *
 * A remembered Google account, a previous workspace snapshot, or a locally
 * cached profile is not proof that the current OAuth attempt succeeded.
 * The caller must not advance to profile setup without a fresh authenticated
 * identity. This pure reducer never creates an account or grants access.
 */
export function expirePendingGoogleSignIn(current) {
  if (!current || current.status !== 'pending-gsi') return current;

  return {
    ...current,
    status: 'unauthenticated',
    appData: null,
    token: null,
    apiAccessToken: null,
    localAccountId: null,
    gsiUser: null,
    pendingCredentialAuth: null,
    pendingGoogleMode: null,
    authMessage: current.pendingGoogleMode === 'new'
      ? 'New-account enrollment could not confirm your Google identity. Please retry.'
      : 'Existing-account sign-in did not complete. Retry Existing User Login; first-time users must choose Create New Account.',
  };
}

/**
 * Reject an OAuth callback error or a failed code exchange without granting
 * access from an old local profile. A late callback must not sign out a
 * completed, independently authenticated session.
 */
export function rejectFailedGoogleAuthorization(current) {
  if (!current || !['pending-gsi', 'pending-drive-check'].includes(current.status)) return current;

  return {
    ...current,
    status: 'unauthenticated',
    appData: null,
    token: null,
    apiAccessToken: null,
    localAccountId: null,
    gsiUser: null,
    pendingCredentialAuth: null,
    pendingGoogleMode: null,
    authMessage: 'Google sign-in could not be verified. Please retry.',
  };
}

/**
 * An explicit "continue" action cannot substitute a remembered email or
 * locally cached profile for completed Google authentication and workspace
 * recovery. This includes a pending Drive lookup after an OAuth exchange:
 * an unconfirmed workspace is not permission to open profile setup.
 */
export function rejectUnverifiedGoogleOnboardingFallback(current) {
  if (!current || !['pending-gsi', 'pending-drive-check'].includes(current.status)) return current;

  return {
    ...current,
    status: 'unauthenticated',
    appData: null,
    token: null,
    apiAccessToken: null,
    localAccountId: null,
    gsiUser: null,
    pendingCredentialAuth: null,
    pendingGoogleMode: null,
    authMessage: 'Google sign-in or workspace verification is incomplete. Retry Google sign-in to continue.',
  };
}

/**
 * A completed OAuth exchange does not prove that Drive or durable workspace
 * recovery succeeded. Timeout must not turn an unverified lookup into a new
 * account, even when the user selected Create New Account.
 */
export function expirePendingGoogleDriveCheck(current) {
  if (!current || current.status !== 'pending-drive-check') return current;

  return {
    ...current,
    status: 'unauthenticated',
    appData: null,
    token: null,
    apiAccessToken: null,
    localAccountId: null,
    gsiUser: null,
    pendingCredentialAuth: null,
    pendingGoogleMode: null,
    authMessage: 'Google workspace lookup timed out before verification. Please retry Google sign-in.',
  };
}

/**
 * A failed Drive lookup is not proof of an empty workspace. Never use a cached
 * local account or create a provisional membership after recovery throws.
 */
export function rejectFailedGoogleDriveRecovery(current) {
  if (!current || current.status !== 'pending-drive-check') return current;

  return {
    ...current,
    status: 'unauthenticated',
    appData: null,
    token: null,
    apiAccessToken: null,
    localAccountId: null,
    gsiUser: null,
    pendingCredentialAuth: null,
    pendingGoogleMode: null,
    authMessage: 'Google workspace recovery failed. Please retry Google sign-in.',
  };
}

/**
 * Admit a completed Google profile lookup only while the matching UI flow is
 * still waiting for Google. An OAuth response arriving after timeout, logout,
 * or an independently completed sign-in cannot resurrect a rejected session.
 *
 * This does not establish attempt uniqueness when two OAuth popups overlap;
 * the provider callback still needs an attempt-bound correlation token.
 */
export function admitVerifiedGoogleProfile(current, accessToken, user) {
  // OAuth profile objects may be malformed proxies or contain throwing getters.
  // Treat inspection failures as unverified rather than crashing admission.
  let verifiedName;
  let verifiedEmail;
  try {
    if (!current || current.status !== 'pending-gsi') return current;
    if (typeof accessToken !== 'string' || !accessToken.trim() || /\s/u.test(accessToken) ||
      !user || typeof user.email !== 'string' ||
      !/^[^\s@\p{Cc}\p{Cf}]+@[^\s@\p{Cc}\p{Cf}]+\.[^\s@\p{Cc}\p{Cf}]+$/u.test(user.email) ||
      user.email !== user.email.normalize('NFC')) {
      return current;
    }
    verifiedName = user.name;
    verifiedEmail = user.email;
  } catch {
    return current;
  }

  return {
    ...current,
    token: current.token || 'google-oauth-token',
    apiAccessToken: accessToken,
    status: 'pending-drive-check',
    gsiUser: { name: verifiedName, email: verifiedEmail },
    // A cached account snapshot is not evidence for this OAuth attempt.
    appData: { user, entities: [] },
  };
}
