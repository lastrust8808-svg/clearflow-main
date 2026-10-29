/**
 * Encode a logical storage identifier as one filesystem path segment.
 * Only string identifiers are accepted: implicit object/number coercion can
 * collapse distinct account identities into the same on-disk directory.
 * Control characters are not valid account or document identifiers.
 * Windows trims trailing periods and reserves device basenames (including
 * names with extensions), which would otherwise alias or fail on that host.
 */
export function sanitizeStorageSegment(value) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value === '.' ||
    value === '..' ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value) ||
    value.endsWith('.') ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value)
  ) {
    throw new TypeError('Invalid storage identifier.');
  }
  return encodeURIComponent(value);
}
