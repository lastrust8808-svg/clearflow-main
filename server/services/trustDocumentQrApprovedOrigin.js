/**
 * Deployment boundary for QR verification. DNS syntax checks are not an
 * authorization mechanism: an operator must explicitly approve each public
 * origin before any document QR locator is issued or resolved.
 *
 * The allowlist must come from trusted server configuration, never from a
 * request header, tenant-supplied value, or document metadata.
 */
import { createTrustDocumentQrLink, digestTrustDocumentQrLink, validatePublicQrOrigin } from './trustDocumentQrPolicy.js';

export function requireApprovedQrOrigin(origin, approvedOrigins) {
  if (typeof origin !== 'string' || !Array.isArray(approvedOrigins) ||
      approvedOrigins.length === 0 || approvedOrigins.length > 128 ||
      !Array.from({ length: approvedOrigins.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(approvedOrigins, String(index));
        return descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string';
      }).every(Boolean)) {
    throw new TypeError('Approved QR verification origin required');
  }
  // A malformed unused entry must not silently survive trusted configuration.
  for (let index = 0; index < approvedOrigins.length; index++) {
    validatePublicQrOrigin(approvedOrigins[index]);
  }
  // Duplicate entries obscure configuration reviews and can conceal accidental
  // copy/paste errors; require one explicit approval per canonical origin.
  if (new Set(approvedOrigins).size !== approvedOrigins.length) {
    throw new TypeError('Duplicate approved QR verification origin');
  }
  // Exact comparison intentionally refuses wildcard, suffix, case-folded,
  // and URL-normalized matches, preventing subdomain and port confusion.
  if (!Array.prototype.includes.call(approvedOrigins, origin)) {
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
