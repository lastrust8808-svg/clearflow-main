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
  if (typeof origin !== 'string' || !Array.isArray(approvedOrigins)) {
    throw new TypeError('Approved QR verification origin required');
  }
  // A Proxy may forge an indexed length read; use the own array-length
  // descriptor so omitted configuration entries cannot bypass validation.
  const lengthDescriptor = Object.getOwnPropertyDescriptor(approvedOrigins, 'length');
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value') ||
      !Number.isInteger(lengthDescriptor.value) || lengthDescriptor.value < 1 ||
      lengthDescriptor.value > 128) {
    throw new TypeError('Approved QR verification origin required');
  }
  // Snapshot descriptor values once. A Proxy can return a safe descriptor but
  // a different value from indexed reads; never authorize the latter.
  const entries = [];
  for (let index = 0; index < lengthDescriptor.value; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(approvedOrigins, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') {
      throw new TypeError('Approved QR verification origin required');
    }
    entries.push(descriptor.value);
  }
  // Refuse additional own configuration keys, including hidden named entries
  // and symbols. Only the intrinsic length and validated indices are allowed.
  // This prevents metadata-bearing arrays from silently bypassing review.
  const ownKeys = Reflect.ownKeys(approvedOrigins);
  if (ownKeys.length !== lengthDescriptor.value + 1) {
    throw new TypeError('Approved QR verification origin required');
  }
  for (const key of ownKeys) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) ||
        Number(key) >= lengthDescriptor.value) {
      throw new TypeError('Approved QR verification origin required');
    }
  }
  // A malformed unused entry must not silently survive trusted configuration.
  for (let index = 0; index < entries.length; index++) {
    validatePublicQrOrigin(entries[index]);
  }
  // Duplicate entries obscure configuration reviews and can conceal accidental
  // copy/paste errors; require one explicit approval per canonical origin.
  // Iterate by validated numeric indices: a caller-supplied Symbol.iterator
  // must not hide duplicate configuration entries from the review gate.
  // Bounded configuration (at most 128 entries) permits direct comparisons,
  // avoiding mutable Set prototype methods during duplicate validation.
  for (let index = 0; index < entries.length; index++) {
    for (let prior = 0; prior < index; prior++) {
      if (entries[prior] === entries[index]) {
        throw new TypeError('Duplicate approved QR verification origin');
      }
    }
  }
  // Exact comparison intentionally refuses wildcard, suffix, case-folded,
  // and URL-normalized matches, preventing subdomain and port confusion.
  // Authorization must not depend on a mutable Set.prototype.has method.
  // Compare the validated descriptor snapshot directly, without invoking
  // caller-controlled collection methods or property accessors.
  let approvedOrigin = false;
  for (let index = 0; index < entries.length; index++) {
    if (entries[index] === origin) approvedOrigin = true;
  }
  if (!approvedOrigin) {
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
