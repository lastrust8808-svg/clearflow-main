import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseMembershipInstant } from './membershipEntitlements.mjs';

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
  if (!authenticatedScope || typeof authenticatedScope !== 'object' ||
      Array.isArray(authenticatedScope)) return null;
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
  if (event.type.startsWith('payment_') &&
      (typeof event.invoiceId !== 'string' || event.invoiceId.trim() === '')) return null;
  if (event.type === 'payment_succeeded' &&
      (typeof event.settlementId !== 'string' || event.settlementId.trim() === '' ||
       typeof event.periodEnd !== 'string' || event.periodEnd.trim() === '')) return null;
  // A valid fixture HMAC is not sufficient to promote malformed dates into
  // verified membership events. Reuse the projector's strict calendar parser.
  try {
    const occurred = parseMembershipInstant(event.occurredAt, 'event.occurredAt');
    if (event.type === 'payment_succeeded' &&
        parseMembershipInstant(event.periodEnd, 'event.periodEnd') <= occurred) return null;
  } catch {
    return null;
  }
  return Object.freeze({ ...event, verified: true });
}
