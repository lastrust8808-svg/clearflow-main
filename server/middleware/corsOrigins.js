// Strict browser-origin allowlist. CORS is not authentication.
export function configuredOrigins(value) {
  return new Set(String(value || 'https://clearflow.site,https://www.clearflow.site,https://clearflow-site.vercel.app')
    .split(',').map(s => s.trim()).filter(Boolean));
}
export function isAllowedBrowserOrigin(origin, allowedOrigins) {
  if (origin === undefined || origin === null || origin === '') return true; // non-browser requests still require auth
  if (typeof origin !== 'string' || origin === 'null') return false;
  try {
    const parsed = new URL(origin);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash) return false;
    return allowedOrigins.has(parsed.origin) && origin === parsed.origin;
  } catch { return false; }
}
