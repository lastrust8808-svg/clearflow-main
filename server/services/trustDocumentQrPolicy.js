import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque QR lookup links for finalized trust documents. A link is only a
 * lookup locator: possession does NOT authenticate a signer, authorize access
 * to private records, or prove that a document was executed or remains valid.
 *
 * Store only the SHA-256 token digest in a tenant-scoped durable registry.
 * Never log the token or place tenant/entity/document IDs, names, hashes,
 * beneficiary details, or other metadata in the QR URL. The HTTPS endpoint
 * must rate-limit lookups, apply its own authorization/disclosure policy, and
 * call the immutable document-version verification policy before responding.
 */
const ROUTE = '/verify/document/';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function canonicalOrigin(value) {
  if (typeof value !== 'string' || value.length > 253) {
    throw new TypeError('Canonical HTTPS verification origin required');
  }
  let parsed;
  try { parsed = new URL(value); } catch {
    throw new TypeError('Canonical HTTPS verification origin required');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.origin !== value ||
      parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new TypeError('Canonical HTTPS verification origin required');
  }
  return value;
}

function tokenBytes(token) {
  if (typeof token !== 'string' || !TOKEN.test(token)) {
    throw new TypeError('Invalid opaque QR verification token');
  }
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== token) {
    throw new TypeError('Noncanonical QR verification token');
  }
  return bytes;
}

function tokenDigest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Creates a 256-bit random, non-identifying QR lookup locator. The caller must
 * atomically persist tokenHashSha256 with the scoped document-version record
 * before publishing the URL. The token cannot be reconstructed from the hash.
 */
export function createTrustDocumentQrLink(origin) {
  const base = canonicalOrigin(origin);
  const token = randomBytes(32).toString('base64url');
  return Object.freeze({
    url: `${base}${ROUTE}${token}`,
    tokenHashSha256: tokenDigest(tokenBytes(token)),
  });
}

/**
 * Parses only an exact, canonical, same-origin QR lookup URL and derives its
 * digest for a tenant-scoped registry lookup. Never treat this digest or the
 * URL as authentication, authorization, or evidence of legal execution.
 */
export function digestTrustDocumentQrLink(url, origin) {
  const base = canonicalOrigin(origin);
  if (typeof url !== 'string' || url.length > 2048) {
    throw new TypeError('Canonical QR verification URL required');
  }
  let parsed;
  try { parsed = new URL(url); } catch {
    throw new TypeError('Canonical QR verification URL required');
  }
  if (parsed.origin !== base || parsed.search || parsed.hash || parsed.username || parsed.password ||
      !parsed.pathname.startsWith(ROUTE)) {
    throw new TypeError('Invalid QR verification URL');
  }
  // Reject URL-parser normalization of dot segments and percent-encoded paths.
  // Only the literal canonical link issued by this module is accepted.
  if (parsed.href !== url) throw new TypeError('Noncanonical QR verification URL');
  const token = parsed.pathname.slice(ROUTE.length);
  const bytes = tokenBytes(token);
  if (parsed.href !== `${base}${ROUTE}${token}`) {
    throw new TypeError('Noncanonical QR verification URL');
  }
  return tokenDigest(bytes);
}
