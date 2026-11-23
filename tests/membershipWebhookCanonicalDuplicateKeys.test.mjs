import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyScopedMembershipWebhookFixture } from '../src/domain/membershipWebhookFixture.mjs';

// Test-only signature format. No billing provider or payment is involved.
const secret = 'test-only-nfc-duplicate-keys-secret-123456789';
const nowSeconds = 1793270400;
const authenticatedScope = { tenantId: 'tenant-test', memberId: 'member-test', subscriptionId: 'sub-test' };
const event = {
  ...authenticatedScope,
  id: 'evt-test',
  type: 'payment_succeeded',
  occurredAt: '2026-10-29T12:00:00Z',
  invoiceId: 'invoice-test',
  settlementId: 'settlement-test',
  periodEnd: '2026-11-29T12:00:00Z',
};
function admit(body) {
  const rawBody = Buffer.from(body, 'utf8');
  const signatureHeader = 't=' + nowSeconds + ',v1=' + createHmac('sha256', secret)
    .update(String(nowSeconds) + '.').update(rawBody).digest('hex');
  return verifyScopedMembershipWebhookFixture({
    rawBody, signatureHeader, secret, nowSeconds, authenticatedScope,
  });
}

test('signed canonical-equivalent JSON keys are rejected before admission', () => {
  const base = JSON.stringify(event);
  for (const extra of [
    '"\\u00e9":1,"e\\u0301":2',
    '"e\\u0301":1,"\\u00e9":2',
    '"nested":{"\\u00e9":1,"e\\u0301":2}',
    '"nested":[{"\\u00e9":1,"e\\u0301":2}]',
  ]) {
    const body = base.slice(0, -1) + ',' + extra + '}';
    assert.equal(admit(body), null, extra);
  }
  assert.equal(admit(base)?.verified, true, 'valid signed fixture remains admissible');
});
