// In-memory only: never persist OAuth bearer tokens in localStorage.
let accessToken = '';
let accountId = '';
export function setStorageAccessToken(token: string | null | undefined, verifiedAccountId?: string) {
  accessToken = token || '';
  accountId = token ? verifiedAccountId || '' : '';
}
export function storageAuthHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export function bankingSession() {
  if (!accessToken || !accountId) throw new Error('Sign in before connecting a bank.');
  return { accountId, headers: { ...storageAuthHeaders(), 'x-clearflow-account-id': accountId } };
}
