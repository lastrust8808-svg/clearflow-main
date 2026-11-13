import { types as nodeTypes } from 'node:util';

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
  let verifiedId;
  try {
    if (!current || current.status !== 'pending-gsi') return current;
    // A provider profile must not execute getters or proxy traps while being
    // admitted to the pending workspace recovery state.
    if (!user || typeof user !== 'object' || Array.isArray(user) || nodeTypes.isProxy(user)) return current;
    const prototype = Object.getPrototypeOf(user);
    if (prototype !== Object.prototype && prototype !== null) return current;
    const emailField = Object.getOwnPropertyDescriptor(user, 'email');
    const nameField = Object.getOwnPropertyDescriptor(user, 'name');
    const idField = Object.getOwnPropertyDescriptor(user, 'id');
    if (!emailField || !Object.hasOwn(emailField, 'value') ||
        (nameField && !Object.hasOwn(nameField, 'value')) ||
        (idField && !Object.hasOwn(idField, 'value'))) return current;
    if (typeof accessToken !== 'string' || !accessToken.trim() || /[\s\p{Z}\p{Cc}\p{Cf}]/u.test(accessToken) ||
      Array.from(accessToken).some((character) => {
        const point = character.codePointAt(0);
        return (point >= 0xD800 && point <= 0xDFFF) ||
          (point >= 0xFDD0 && point <= 0xFDEF) || (point & 0xFFFE) === 0xFFFE;
      }) ||
      !user || typeof emailField.value !== 'string' ||
      !/^[^\s@\p{Cc}\p{Cf}]+@[^\s@\p{Cc}\p{Cf}]+\.[^\s@\p{Cc}\p{Cf}]+$/u.test(emailField.value) ||
      emailField.value !== emailField.value.normalize('NFC')) {
      return current;
    }
    if (nameField && (typeof nameField.value !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(nameField.value))) return current;
    if (idField && (typeof idField.value !== 'string' || !idField.value.trim() ||
      /[\p{Cc}\p{Cf}\p{Cs}]/u.test(idField.value) || idField.value !== idField.value.normalize('NFC'))) return current;
    verifiedId = idField?.value;
    verifiedName = nameField?.value;
    verifiedEmail = emailField.value;
  } catch {
    return current;
  }

  return {
    ...current,
    // OAuth profile admission is not application-session authentication.
    // Never carry forward a cached credential or fabricate a token here.
    token: null,
    apiAccessToken: accessToken,
    status: 'pending-drive-check',
    gsiUser: { name: verifiedName, email: verifiedEmail },
    // A cached account snapshot is not evidence for this OAuth attempt.
    // Do not retain the provider-owned object: it can be mutated after validation.
    // Only verified profile fields are needed to identify pending recovery.
    appData: { user: { ...(verifiedId === undefined ? {} : { id: verifiedId }), email: verifiedEmail, ...(verifiedName === undefined ? {} : { name: verifiedName }) }, entities: [] },
  };
}
