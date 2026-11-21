import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyScopedMembershipWebhookFixture } from '../src/domain/membershipWebhookFixture.mjs';

// TEST-ONLY fixture. This does not verify a real billing provider or grant access.
const secret = 'fixture-secret-with-at-least-32-bytes';
const timestamp = 1793270400;
const authenticatedScope = Object.freeze({
  tenantId: 'tenant-test', memberId: 'member-test', subscriptionId: 'sub-test',
});
const event = {
  ...authenticatedScope, id: 'evt-test', type: 'payment_succeeded',
  occurredAt: '2026-10-29T12:00:00Z', invoiceId: 'inv-test',
  settlementId: 'settle-test', periodEnd: '2026-11-29T12:00:00Z',
};
function verify(raw) {
  const rawBody = Buffer.from(raw, 'utf8');
  const digest = createHmac('sha256', secret)
    .update(String(timestamp) + '.').update(rawBody).digest('hex');
  return verifyScopedMembershipWebhookFixture({
    rawBody, signatureHeader: `t=${timestamp},v1=${digest}`,
    secret, nowSeconds: timestamp, authenticatedScope,
  });
}

test('NFC-equivalent duplicate keys fail closed even when the first key is decomposed', () => {
  const json = JSON.stringify(event);
  const injected = json.replace('"id":"evt-test"',
    '"id":"evt-test","me\\u0301tadata":1,"métadata":2');
  assert.equal(verify(injected), null);
  assert.equal(verify(json)?.verified, true);
});

test('duplicate keys inside arrays nested under unknown claims fail closed', () => {
  const json = JSON.stringify(event);
  const injected = json.replace('"id":"evt-test"',
    '"id":"evt-test","metadata":[{"claim":false,"cl\\u0061im":true}]');
  assert.equal(verify(injected), null);
});
