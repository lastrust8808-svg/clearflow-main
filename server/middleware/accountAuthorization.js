// Fail-closed authorization for account-scoped storage.
// Google access tokens are verified by Google on the server, not trusted as decoded client claims.
export async function requireAccountAccess(req, res, next) {
  const accountId = req.params.accountId;
  const match = /^Bearer (\S+)$/i.exec(req.get('authorization') || '');
  if (!match) return res.status(401).json({ success: false, error: 'Authentication required.' });
  if (!accountId || !accountId.startsWith('google:')) {
    return res.status(403).json({ success: false, error: 'Account requires server-side identity migration.' });
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response;
    try {
      response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${match[1]}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return res.status(401).json({ success: false, error: 'Invalid session.' });
    const profile = await response.json();
    if (!profile.email_verified || !profile.email ||
        `google:${String(profile.email).trim().toLowerCase()}` !== accountId.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'Account access denied.' });
    }
    req.verifiedIdentity = { email: profile.email, subject: profile.sub };
    return next();
  } catch {
    return res.status(503).json({ success: false, error: 'Identity verification unavailable.' });
  }
}
export function requireInternalLedgerAuthorization(_req, res) {
  return res.status(403).json({ success: false, error: 'Internal ledger ingestion disabled pending service authentication.' });
}
