import { createHmac, timingSafeEqual } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import { parseMembershipIdentifier, parseMembershipInstant, compareMembershipInstants } from './membershipEntitlements.mjs';

/**
 * TEST-ONLY signed webhook fixture for deterministic adapter acceptance tests.
 * This is NOT a Stripe, Mercury, Plaid, or other provider's signature format.
 * Do not mount as a production webhook route or use it to mark billing paid.
 * Real adapters must verify the provider's documented raw-body signature,
 * authenticate tenant/subscription ownership, and durably deduplicate events.
 *
 * Header: t=<unix seconds>,v1=<64 lowercase hex characters>
 * Signed bytes: UTF-8 timestamp, '.', then the exact raw request body bytes.
 */
export function verifyMembershipWebhookFixture({ rawBody, signatureHeader, secret, nowSeconds }) {
  if (!(typeof rawBody === 'string' || Buffer.isBuffer(rawBody))) {
    throw new TypeError('rawBody must be raw UTF-8 text or a Buffer');
  }
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new TypeError('fixture secret must contain at least 32 UTF-8 bytes');
  }
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    throw new TypeError('nowSeconds must be a nonnegative integer');
  }
  // Bound signature verification and JSON admission to prevent oversized
  // signed fixtures from exhausting the test adapter's CPU or memory.
  if (Buffer.byteLength(rawBody, 'utf8') > 65536) return false;
  // Node's UTF-8 encoding replaces lone UTF-16 surrogates with U+FFFD.
  // Reject such strings so distinct raw event identities cannot share the
  // same signed bytes after a lossy conversion. Valid pairs remain accepted.
  if (typeof rawBody === 'string' && hasUnpairedSurrogate(rawBody)) return false;
  if (typeof signatureHeader !== 'string') return false;
  const match = /^t=(0|[1-9]\d*),v1=([a-f0-9]{64})$/.exec(signatureHeader);
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
  const actual = Buffer.from(match[2], 'hex');
  const expected = createHmac('sha256', secret)
    .update(match[1] + '.', 'utf8')
    .update(rawBody)
    .digest();
  return timingSafeEqual(actual, expected);
}


// JSON escape sequences can decode into unpaired UTF-16 surrogates even when
// the raw signed body contains only valid UTF-8 ASCII. Such identities must
// not cross the fixture verification boundary as malformed Unicode.
function hasUnpairedSurrogate(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

// JSON.parse silently keeps the last occurrence of a duplicate object key.
// A signed payload with conflicting event IDs, tenant IDs, or paid-through
// dates must not be admitted under the last value. Compare decoded key names
// so escaped aliases (e.g. "\\u0069d" and "id") are also detected.
// JSON.parse below remains responsible for full JSON syntax validation.
function containsDuplicateObjectKeys(jsonText) {
  const frames = [];
  let quoteStart = -1;
  let escaped = false;
  for (let i = 0; i < jsonText.length; i++) {
    const char = jsonText[i];
    if (quoteStart >= 0) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        const frame = frames[frames.length - 1];
        if (frame?.kind === 'object' && frame.expectKey) {
          const key = JSON.parse(jsonText.slice(quoteStart, i + 1));
          if (frame.keys.has(key)) return true;
          frame.keys.add(key);
          frame.expectKey = false;
        }
        quoteStart = -1;
      }
      continue;
    }
    if (char === '"') quoteStart = i;
    else if (char === '{') frames.push({ kind: 'object', expectKey: true, keys: new Set() });
    else if (char === '[') frames.push({ kind: 'array' });
    else if (char === '}' || char === ']') frames.pop();
    else if (char === ',' && frames[frames.length - 1]?.kind === 'object') {
      frames[frames.length - 1].expectKey = true;
    }
  }
  return false;
}


/**
 * TEST-ONLY scope-bound admission fixture. A valid HMAC alone must never grant
 * another tenant's membership. This does not persist or deduplicate events,
 * verify a real billing provider, or authorize entitlements in production.
 * The caller must supply the authenticated scope from server-side identity,
 * never from the webhook body itself.
 *
 * Returns a frozen event suitable only for deterministic projection tests,
 * or null on invalid signatures, JSON, or tenant/member/subscription binding.
 */
export function verifyScopedMembershipWebhookFixture({
  rawBody, signatureHeader, secret, nowSeconds, authenticatedScope,
}) {
  if (!verifyMembershipWebhookFixture({ rawBody, signatureHeader, secret, nowSeconds })) return null;
  // Authenticated scope must come from an explicit server-side identity record,
  // not inherited properties, getters, hidden fields, or proxy-like wrappers.
  // Check descriptors before reading any scope value to avoid executing getters.
  // A Proxy can fabricate property descriptors or invoke traps during scope
  // inspection. Reject it before any reflective operation or identity read,
  // including revoked Proxies whose traps would otherwise throw.
  if (!authenticatedScope || typeof authenticatedScope !== 'object' ||
      nodeTypes.isProxy(authenticatedScope) || Array.isArray(authenticatedScope)) return null;
  try {
    const prototype = Object.getPrototypeOf(authenticatedScope);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(authenticatedScope);
    const requiredScopeFields = ['tenantId', 'memberId', 'subscriptionId'];
    if (Reflect.ownKeys(descriptors).length !== requiredScopeFields.length) return null;
    for (const field of requiredScopeFields) {
      const descriptor = descriptors[field];
      if (!descriptor || !descriptor.enumerable ||
          !Object.hasOwn(descriptor, 'value') ||
          typeof descriptor.value !== 'string') return null;
    }
  } catch {
    return null;
  }
  let event;
  try {
    // Buffer.toString('utf8') silently substitutes U+FFFD for malformed bytes.
    // A signed but lossy-decoded event could alias another event identity in
    // downstream deduplication. Reject invalid UTF-8 before JSON admission.
    const jsonText = Buffer.isBuffer(rawBody)
      ? new TextDecoder('utf-8', { fatal: true }).decode(rawBody)
      : rawBody;
    if (containsDuplicateObjectKeys(jsonText)) return null;
    event = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!event || typeof event !== 'object' || Array.isArray(event) ||
      Object.hasOwn(event, 'verified')) return null;
  // JSON.parse accepts escaped lone surrogates (e.g. "\\uD800"), which
  // bypasses the raw-body UTF-16 guard. Reject decoded malformed identities.
  if (Object.values(event).some(value =>
    typeof value === 'string' && hasUnpairedSurrogate(value))) return null;
  for (const field of ['tenantId', 'memberId', 'subscriptionId']) {
    if (typeof authenticatedScope[field] !== 'string' ||
        authenticatedScope[field].trim() === '' ||
        event[field] !== authenticatedScope[field]) return null;
  }
  if (typeof event.id !== 'string' || event.id.trim() === '' ||
      typeof event.type !== 'string' || event.type.trim() === '' ||
      typeof event.occurredAt !== 'string' || event.occurredAt.trim() === '') return null;
  // Only admit the documented event contract. A signed but unexpected claim
  // (e.g. entitled, role, paid, or a payment field on a cancellation) must
  // not cross this test adapter's verification boundary as trusted data.
  const common = ['id', 'type', 'tenantId', 'memberId', 'subscriptionId', 'occurredAt'];
  const payment = ['invoiceId'];
  const allowedByType = {
    subscription_created: common,
    subscription_cancelled: common,
    payment_failed: [...common, ...payment],
    payment_refunded: [...common, ...payment],
    payment_succeeded: [...common, ...payment, 'settlementId', 'periodEnd'],
  };
  const allowed = Object.hasOwn(allowedByType, event.type) ? allowedByType[event.type] : null;
  if (!allowed || Object.keys(event).some((key) => !allowed.includes(key))) return null;
  // A valid fixture signature must not mark ambiguous IDs as verified.
  // Apply the same canonical identity policy used by entitlement projection
  // to BOTH authenticated scope and all admitted event identity fields.
  // This remains a test-only adapter, not real provider authorization.
  try {
    for (const field of ['tenantId', 'memberId', 'subscriptionId']) {
      parseMembershipIdentifier(authenticatedScope[field], 'authenticatedScope.' + field);
    }
    for (const field of ['id', 'tenantId', 'memberId', 'subscriptionId']) {
      parseMembershipIdentifier(event[field], 'event.' + field);
    }
    if (event.type.startsWith('payment_')) {
      parseMembershipIdentifier(event.invoiceId, 'event.invoiceId');
    }
    if (event.type === 'payment_succeeded') {
      parseMembershipIdentifier(event.settlementId, 'event.settlementId');
    }
  } catch {
    return null;
  }
  // A valid fixture HMAC is not sufficient to promote malformed dates into
  // verified membership events. Reuse the projector's strict calendar parser.
  try {
    parseMembershipInstant(event.occurredAt, 'event.occurredAt');
    if (event.type === 'payment_succeeded' &&
        compareMembershipInstants(event.periodEnd, event.occurredAt) <= 0) return null;
  } catch {
    return null;
  }
  return Object.freeze({ ...event, verified: true });
}
