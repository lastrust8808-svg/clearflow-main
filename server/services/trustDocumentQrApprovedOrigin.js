/**
 * Deployment boundary for QR verification. DNS syntax checks are not an
 * authorization mechanism: an operator must explicitly approve each public
 * origin before any document QR locator is issued or resolved.
 *
 * The allowlist must come from trusted server configuration, never from a
 * request header, tenant-supplied value, or document metadata.
 */
import { createTrustDocumentQrLink, digestTrustDocumentQrLink } from './trustDocumentQrPolicy.js';

export function requireApprovedQrOrigin(origin, approvedOrigins) {
  if (typeof origin !== 'string' || !Array.isArray(approvedOrigins) ||
      approvedOrigins.length === 0 || !approvedOrigins.every(x => typeof x === 'string')) {
    throw new TypeError('Approved QR verification origin required');
  }
  // Exact comparison intentionally refuses wildcard, suffix, case-folded,
  // and URL-normalized matches, preventing subdomain and port confusion.
  if (!approvedOrigins.includes(origin)) {
    throw new TypeError('Unapproved QR verification origin');
  }
  return origin;
}

export function createApprovedTrustDocumentQrLink(origin, approvedOrigins) {
  return createTrustDocumentQrLink(requireApprovedQrOrigin(origin, approvedOrigins));
}

export function digestApprovedTrustDocumentQrLink(url, origin, approvedOrigins) {
  return digestTrustDocumentQrLink(url, requireApprovedQrOrigin(origin, approvedOrigins));
}
