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
