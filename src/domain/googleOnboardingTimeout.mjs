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
