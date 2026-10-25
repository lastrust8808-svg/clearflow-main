// Short-lived, tab-scoped Link state. Never store bank access tokens here.
const KEY = 'clearflow-plaid-link-v1';
const MAX_AGE = 30 * 60 * 1000;
export function isPlaidOAuthReturn() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('oauth_state_id');
}
export function savePlaidLinkSession(token: string, accountId: string, targetAccountId: string | null) {
  window.sessionStorage.setItem(KEY, JSON.stringify({ token, accountId, targetAccountId, createdAt: Date.now() }));
}
export function readPlaidLinkSession(accountId: string) {
  try {
    const state = JSON.parse(window.sessionStorage.getItem(KEY) || 'null');
    if (!state || state.accountId !== accountId || typeof state.token !== 'string' || !state.token ||
        !Number.isFinite(state.createdAt) || Date.now() - state.createdAt < 0 || Date.now() - state.createdAt > MAX_AGE) return null;
    return state as { token: string; accountId: string; targetAccountId: string | null };
  } catch { return null; }
}
export function clearPlaidLinkSession() {
  window.sessionStorage.removeItem(KEY);
  if (isPlaidOAuthReturn()) {
    const url = new URL(window.location.href);
    url.searchParams.delete('oauth_state_id');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}
export function plaidReceivedRedirectUri() {
  // App routing may append its own hash; Plaid must receive only its original callback.
  const url = new URL(window.location.href);
  url.hash = '';
  return url.href;
}
