/**
 * Encode an untrusted logical storage identifier as exactly one filesystem
 * path segment. encodeURIComponent deliberately leaves '.' and '..' intact,
 * so reject those values before they can escape the account storage root.
 */
export function sanitizeStorageSegment(value) {
  const raw = String(value ?? '');
  if (!raw.trim() || raw === '.' || raw === '..') {
    throw new TypeError('Invalid storage identifier.');
  }
  return encodeURIComponent(raw);
}
