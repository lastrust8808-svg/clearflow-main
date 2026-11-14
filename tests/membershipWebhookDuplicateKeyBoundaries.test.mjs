import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyScopedMembershipWebhookFixture } from '../src/domain/membershipWebhookFixture.mjs';

// Test-only fixture: a valid HMAC must not make ambiguous JSON claims trusted.
const secret = 'test-only-secret-32-bytes-at-least-12345';
const timestamp = 1793270400;
const scope = Object.freeze({ tenantId: 'tenant-test', memberId: 'member-test', subscriptionId: 'sub-test' });
const base = {
  ...scope, id: 'evt-café', type: 'payment_succeeded',
  occurredAt: '2026-10-29T12:00:00Z', invoiceId: 'inv-test',
  settlementId: 'settle-test', periodEnd: '2026-11-29T12:00:00Z',
};
function admit(json) {
  const rawBody = Buffer.from(json, 'utf8');
  const digest = createHmac('sha256', secret)
    .update(String(timestamp) + '.').update(rawBody).digest('hex');
  return verifyScopedMembershipWebhookFixture({
    rawBody, signatureHeader: `t=${timestamp},v1=${digest}`,
    secret, nowSeconds: timestamp, authenticatedScope: scope,
  });
}

test('signed duplicate event keys with NFC-equivalent spelling are not admitted', () => {
  const body = JSON.stringify(base);
  const duplicate = body.replace('"id":"evt-café"', '"id":"evt-café","i\\u0064":"evt-shadow"');
  assert.equal(admit(duplicate), null);
  assert.equal(admit(body)?.verified, true);
});

test('signed duplicate nested claims cannot be promoted into verified events', () => {
  const body = JSON.stringify(base);
  const nested = body.replace('"id":"evt-café"', '"id":"evt-café","metadata":{"role":"viewer","role":"owner"}');
  assert.equal(admit(nested), null);
});
