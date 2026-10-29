/**
 * Encode a logical storage identifier as one filesystem path segment.
 * Only string identifiers are accepted: implicit object/number coercion can
 * collapse distinct account identities into the same on-disk directory.
 * Control characters are not valid account or document identifiers.
 */
export function sanitizeStorageSegment(value) {
  if (typeof value !== 'string' || !value.trim() || value === '.' || value === '..' || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError('Invalid storage identifier.');
  }
  return encodeURIComponent(value);
}
