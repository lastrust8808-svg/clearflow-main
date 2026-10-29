import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyMembershipWebhookFixture as verify } from '../src/domain/membershipWebhookFixture.mjs';

const secret = 'test-only-secret-32-bytes-at-least-12345';
const nowSeconds = 1793270400;
const rawBody = Buffer.from('{"id":"evt-test","paid":false}\n', 'utf8');
const sign = (body = rawBody, timestamp = nowSeconds) =>
  `t=${timestamp},v1=${createHmac('sha256', secret).update(String(timestamp) + '.').update(body).digest('hex')}`;
const input = (overrides = {}) => ({ rawBody, signatureHeader: sign(), secret, nowSeconds, ...overrides });

test('accepts exact signed raw bytes within 5-minute fixture window', () => {
  assert.equal(verify(input()), true);
  assert.equal(verify(input({ signatureHeader: sign(rawBody, nowSeconds - 300) })), true);
  assert.equal(verify(input({ signatureHeader: sign(rawBody, nowSeconds + 300) })), true);
});
test('rejects tampering, whitespace changes and incorrect secrets', () => {
  assert.equal(verify(input({ rawBody: Buffer.from('{"id":"evt-test","paid":true}\n') })), false);
  assert.equal(verify(input({ rawBody: rawBody.toString().trim() })), false);
  assert.equal(verify(input({ secret: 'different-32-byte-fixture-secret-123456' })), false);
});
test('rejects stale and future signatures, even when cryptographically valid', () => {
  assert.equal(verify(input({ signatureHeader: sign(rawBody, nowSeconds - 301) })), false);
  assert.equal(verify(input({ signatureHeader: sign(rawBody, nowSeconds + 301) })), false);
});
test('rejects malformed, duplicated, noncanonical or overflowed signature headers', () => {
  for (const signatureHeader of [null, '', 'v1=bad', sign() + ',v1=' + 'a'.repeat(64),
    sign().toUpperCase(), sign().replace('t=', 't=0'), 't=99999999999999999999999,v1=' + 'a'.repeat(64),
    sign().replace('v1=', 'v2='), sign().replace('v1=', 'v1=0')]) {
    assert.equal(verify(input({ signatureHeader })), false, String(signatureHeader));
  }
});
test('rejects non-raw body, weak secrets and invalid clock inputs', () => {
  assert.throws(() => verify(input({ rawBody: { id: 'evt-test' } })), /rawBody/);
  assert.throws(() => verify(input({ secret: 'short' })), /secret/);
  for (const clock of [-1, NaN, Infinity, 0.5, '1793270400']) {
    assert.throws(() => verify(input({ nowSeconds: clock })), /nowSeconds/);
  }
});
test('supports binary body bytes without JSON reserialization', () => {
  const binary = Buffer.from([0, 255, 1, 32, 0]);
  assert.equal(verify(input({ rawBody: binary, signatureHeader: sign(binary) })), true);
  assert.equal(verify(input({ rawBody: Buffer.from([0, 255, 1, 32, 1]), signatureHeader: sign(binary) })), false);
});
