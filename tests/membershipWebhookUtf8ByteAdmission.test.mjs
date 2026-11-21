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
  for (const bad of [
    Buffer.from([0xff]),              // forbidden byte
    Buffer.from([0xc0, 0xaf]),        // overlong encoding
    Buffer.from([0xed, 0xa0, 0x80]),  // encoded surrogate
    Buffer.from([0xe2, 0x82]),        // truncated three-byte sequence
    Buffer.from([0x80]),              // isolated continuation byte
    Buffer.from([0xf4, 0x90, 0x80, 0x80]), // code point above U+10FFFF
  ]) {
    // Corrupt the allowed event ID itself, rather than adding an unknown field.
    // Otherwise the schema allowlist could reject the fixture even if fatal
    // UTF-8 decoding were accidentally removed.
    const identity = Buffer.from('éclair', 'utf8');
    const at = body.indexOf(identity);
    assert.notEqual(at, -1);
    const rawBody = Buffer.concat([body.subarray(0, at), bad, body.subarray(at + identity.length)]);
    const candidate = signed(rawBody);
    assert.equal(verifyMembershipWebhookFixture(candidate), true, 'HMAC validates exact bytes');
    assert.equal(verifyScopedMembershipWebhookFixture(candidate), null, 'lossy UTF-8 cannot be admitted');
  }
});

test('valid multibyte UTF-8 event identity remains admissible', () => {
  const candidate = signed(Buffer.from(JSON.stringify(event), 'utf8'));
  assert.equal(verifyScopedMembershipWebhookFixture(candidate)?.id, event.id);
});

test('signed escaped lone surrogates in permitted event IDs fail closed', () => {
  for (const escape of ['\\uD800', '\\uDC00']) {
    const rawBody = Buffer.from(JSON.stringify(event).replace('evt-éclair', 'evt-' + escape), 'utf8');
    const candidate = signed(rawBody);
    assert.equal(verifyMembershipWebhookFixture(candidate), true, 'raw ASCII fixture signature is valid');
    assert.equal(verifyScopedMembershipWebhookFixture(candidate), null, 'decoded malformed Unicode identity is rejected');
  }
});

test('signed valid supplementary Unicode event IDs remain admissible', () => {
  const candidate = signed(Buffer.from(JSON.stringify({ ...event, id: 'evt-🌱' }), 'utf8'));
  assert.equal(verifyScopedMembershipWebhookFixture(candidate)?.id, 'evt-🌱');
});

test('signed escaped lone surrogates in every admitted identity field fail closed', () => {
  for (const field of ['id', 'tenantId', 'memberId', 'subscriptionId', 'invoiceId', 'settlementId']) {
    for (const escape of ['\\uD800', '\\uDC00']) {
      // Encode a literal JSON escape, not an invalid JS source string.
      const json = JSON.stringify({ ...event, [field]: 'sentinel' });
      const rawBody = Buffer.from(json.replace('"sentinel"', '"bad-' + escape + '"'), 'utf8');
      const candidate = signed(rawBody);
      // For scoped identity fields, match the malformed decoded value in the
      // authenticated test scope. A mere scope mismatch must not be what
      // makes this malformed-Unicode regression pass.
      if (Object.hasOwn(scope, field)) {
        candidate.authenticatedScope = { ...scope, [field]: 'bad-' + String.fromCharCode(parseInt(escape.slice(2), 16)) };
      }
      assert.equal(verifyMembershipWebhookFixture(candidate), true, field + ' fixture signature');
      assert.equal(verifyScopedMembershipWebhookFixture(candidate), null, field + ' malformed identity');
    }
  }
});
