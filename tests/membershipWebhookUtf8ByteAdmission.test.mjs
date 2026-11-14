import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyMembershipWebhookFixture, verifyScopedMembershipWebhookFixture } from '../src/domain/membershipWebhookFixture.mjs';

// Deterministic fixture only: never represents provider payment verification.
const secret = 'test-only-secret-32-bytes-at-least-12345';
const timestamp = 1793270400;
const scope = Object.freeze({ tenantId: 'tenant-test', memberId: 'member-test', subscriptionId: 'sub-test' });
const event = {
  ...scope, id: 'evt-éclair', type: 'payment_succeeded',
  occurredAt: '2026-10-29T12:00:00Z', invoiceId: 'inv-test',
  settlementId: 'settle-test', periodEnd: '2026-11-29T12:00:00Z',
};
function signed(rawBody) {
  const digest = createHmac('sha256', secret)
    .update(String(timestamp) + '.').update(rawBody).digest('hex');
  return { rawBody, signatureHeader: `t=${timestamp},v1=${digest}`,
    secret, nowSeconds: timestamp, authenticatedScope: scope };
}

test('signed invalid UTF-8 bytes never become a scope-verified event', () => {
  const body = Buffer.from(JSON.stringify(event));
  for (const bad of [Buffer.from([0xff]), Buffer.from([0xc0, 0xaf]), Buffer.from([0xed, 0xa0, 0x80])]) {
    const rawBody = Buffer.concat([body.subarray(0, -1), Buffer.from(',"extra":"'), bad, Buffer.from('"}')]);
    const candidate = signed(rawBody);
    assert.equal(verifyMembershipWebhookFixture(candidate), true, 'HMAC validates exact bytes');
    assert.equal(verifyScopedMembershipWebhookFixture(candidate), null, 'lossy UTF-8 cannot be admitted');
  }
});

test('valid multibyte UTF-8 event identity remains admissible', () => {
  const candidate = signed(Buffer.from(JSON.stringify(event), 'utf8'));
  assert.equal(verifyScopedMembershipWebhookFixture(candidate)?.id, event.id);
});
