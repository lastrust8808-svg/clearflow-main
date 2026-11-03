/**
 * Encode a logical storage identifier as one filesystem path segment.
 * Only string identifiers are accepted: implicit object/number coercion can
 * collapse distinct account identities into the same on-disk directory.
 * Control characters and Unicode format controls (including invisible and
 * bidirectional text controls) are not valid account or document identifiers.
 * Windows trims trailing periods and reserves device basenames (including
 * names with extensions and superscript ¹²³ device digits), which would otherwise alias or fail on that host.
 *
 * The same segment is also used as a JSON filename with a ".json" suffix.
 * Limit the encoded ASCII segment to 250 bytes so the resulting basename
 * fits the common 255-byte filesystem component limit.
 */
function containsUnicodeNoncharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if ((code >= 0xFDD0 && code <= 0xFDEF) || (code & 0xFFFE) === 0xFFFE) return true;
  }
  return false;
}

export function sanitizeStorageSegment(value) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    /^\s|\s$/u.test(value) ||
    value !== value.normalize('NFC') ||
    containsUnicodeNoncharacter(value) ||
    value === '.' ||
    value === '..' ||
    /[\u0000-\u001f\u007f-\u009f\p{Cf}\p{Zl}\p{Zp}]/u.test(value) ||
    value.endsWith('.') ||
    /^(?:con|conin\$|conout\$|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(value)
  ) {
    throw new TypeError('Invalid storage identifier.');
  }

  // encodeURIComponent throws URIError for unpaired UTF-16 surrogates.
  // Normalize that failure to the same explicit input-validation error,
  // rather than letting malformed user identifiers reach filesystem I/O.
  let segment;
  try {
    segment = encodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) {
      throw new TypeError('Invalid storage identifier.');
    }
    throw error;
  }

  if (segment.length > 250) {
    throw new TypeError('Invalid storage identifier.');
  }
  return segment;
}
