// In-memory only: never persist OAuth bearer tokens in localStorage.
let accessToken = '';
export function setStorageAccessToken(token: string | null | undefined) {
  accessToken = token || '';
}
export function storageAuthHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}
