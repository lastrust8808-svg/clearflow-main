import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyScopedMembershipWebhookFixture } from '../src/domain/membershipWebhookFixture.mjs';

// Test-only fixture signature; not a provider webhook or billing authorization.
const secret = 'fixture-only-key-at-least-thirty-two-bytes';
const nowSeconds = 1793270400;
const scope = Object.freeze({
  tenantId: 'tenant-boundary', memberId: 'member-boundary', subscriptionId: 'sub-boundary',
});
const payload = {
  ...scope, id: 'evt-boundary', type: 'payment_succeeded',
  occurredAt: '2026-10-29T12:00:00Z', invoiceId: 'inv-boundary',
  settlementId: 'settlement-boundary', periodEnd: '2026-11-29T12:00:00Z',
};
function signed(rawBody) {
  return {
    rawBody,
    signatureHeader: 't=' + nowSeconds + ',v1=' +
      createHmac('sha256', secret).update(nowSeconds + '.').update(rawBody).digest('hex'),
    secret, nowSeconds, authenticatedScope: scope,
  };
}

test('scoped signed UTF-8 JSON is admitted at exact 65536-byte limit, not above', () => {
  const base = Buffer.from(JSON.stringify(payload), 'utf8');
  assert.ok(base.length < 65536);
  const atLimit = Buffer.concat([base, Buffer.alloc(65536 - base.length, 0x20)]);
  assert.equal(atLimit.length, 65536);
  const admitted = verifyScopedMembershipWebhookFixture(signed(atLimit));
  assert.equal(admitted?.verified, true);
  assert.equal(admitted?.id, payload.id);
  const aboveLimit = Buffer.concat([atLimit, Buffer.from(' ')]);
  assert.equal(aboveLimit.length, 65537);
  assert.equal(verifyScopedMembershipWebhookFixture(signed(aboveLimit)), null);
});

test('scoped signed multibyte JSON uses raw UTF-8 byte length at boundary', () => {
  const unicodePayload = { ...payload, id: 'evt-😀' };
  const base = Buffer.from(JSON.stringify(unicodePayload), 'utf8');
  const atLimit = Buffer.concat([base, Buffer.alloc(65536 - base.length, 0x20)]);
  assert.equal(verifyScopedMembershipWebhookFixture(signed(atLimit))?.id, 'evt-😀');
  const aboveLimit = Buffer.concat([atLimit, Buffer.from('😀', 'utf8')]);
  assert.equal(aboveLimit.length, 65540);
  assert.equal(verifyScopedMembershipWebhookFixture(signed(aboveLimit)), null);
});

test('correctly signed malformed UTF-8 at the byte ceiling never becomes a verified event', () => {
  const base = Buffer.from(JSON.stringify(payload), 'utf8');
  const body = Buffer.concat([
    base,
    Buffer.alloc(65536 - base.length - 1, 0x20),
    Buffer.from([0xff]),
  ]);
  assert.equal(body.length, 65536);
  // HMAC validates the exact bytes; scoped JSON admission must independently
  // reject lossy UTF-8 decoding rather than normalize an attacker-signed body.
  assert.equal(verifyScopedMembershipWebhookFixture(signed(body)), null);
  assert.equal(verifyScopedMembershipWebhookFixture(signed(
    Buffer.concat([base, Buffer.alloc(65536 - base.length, 0x20)]),
  ))?.verified, true);
});
