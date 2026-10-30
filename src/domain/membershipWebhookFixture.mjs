import { createHmac, timingSafeEqual } from 'node:crypto';

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
    event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
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
  const allowed = allowedByType[event.type];
  if (!allowed || Object.keys(event).some((key) => !allowed.includes(key))) return null;
  if (event.type.startsWith('payment_') &&
      (typeof event.invoiceId !== 'string' || event.invoiceId.trim() === '')) return null;
  if (event.type === 'payment_succeeded' &&
      (typeof event.settlementId !== 'string' || event.settlementId.trim() === '' ||
       typeof event.periodEnd !== 'string' || event.periodEnd.trim() === '')) return null;
  return Object.freeze({ ...event, verified: true });
}
