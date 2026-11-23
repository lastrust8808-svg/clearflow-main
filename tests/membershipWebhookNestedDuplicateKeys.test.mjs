import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyScopedMembershipWebhookFixture } from '../src/domain/membershipWebhookFixture.mjs';

// Test-only fixture: no real provider signature, payment, or production route.
const secret = 'test-only-nested-duplicate-keys-secret-123456';
const nowSeconds = 1793270400;
const authenticatedScope = { tenantId: 'tenant-test', memberId: 'member-test', subscriptionId: 'sub-test' };
const event = {
  ...authenticatedScope,
  id: 'evt-test', type: 'payment_succeeded',
  occurredAt: '2026-10-29T12:00:00Z', invoiceId: 'invoice-test',
  settlementId: 'settlement-test', periodEnd: '2026-11-29T12:00:00Z',
};
function admit(body) {
  const rawBody = Buffer.from(body, 'utf8');
  const signatureHeader = 't=' + nowSeconds + ',v1=' + createHmac('sha256', secret)
    .update(String(nowSeconds) + '.').update(rawBody).digest('hex');
  return verifyScopedMembershipWebhookFixture({ rawBody, signatureHeader, secret, nowSeconds, authenticatedScope });
}

test('signed nested duplicate keys cannot bypass strict event admission', () => {
  const base = JSON.stringify(event);
  for (const nested of [
    '{"role":"user","role":"owner"}',
    '{"\\u0072ole":"user","role":"owner"}',
    '[{"id":"one","id":"two"}]',
    '{"outer":{"paid":false,"paid":true}}',
  ]) {
    const body = base.slice(0, -1) + ',"extra":' + nested + '}';
    assert.equal(admit(body), null, nested);
  }
  assert.equal(admit(base)?.verified, true, 'valid fixture remains admissible');
});

test('same key in distinct nested objects is not treated as a duplicate', () => {
  // Unknown claims still fail contract admission, regardless of key handling.
  const body = JSON.stringify(event).slice(0, -1) + ',"extra":[{"id":"one"},{"id":"two"}]}';
  assert.equal(admit(body), null);
  assert.equal(admit(JSON.stringify(event))?.verified, true);
});
