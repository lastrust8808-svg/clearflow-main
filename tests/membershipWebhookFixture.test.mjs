import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyMembershipWebhookFixture as verify, verifyScopedMembershipWebhookFixture as verifyScoped } from '../src/domain/membershipWebhookFixture.mjs';

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


const authenticatedScope = { tenantId: 'tenant-test', memberId: 'member-test', subscriptionId: 'sub-test' };
const scopedPayload = {
  ...authenticatedScope,
  id: 'evt-scope-test',
  type: 'payment_succeeded',
  occurredAt: '2026-10-29T12:00:00Z',
  invoiceId: 'inv-test',
  settlementId: 'settle-test',
  periodEnd: '2026-11-29T12:00:00Z',
};
const scopedBody = (value) => Buffer.from(JSON.stringify(value), 'utf8');
const scopedInput = (value = scopedPayload, overrides = {}) => {
  const body = scopedBody(value);
  return {
    rawBody: body,
    signatureHeader: sign(body),
    secret,
    nowSeconds,
    authenticatedScope,
    ...overrides,
  };
};

test('signed fixture event is admitted only for exact authenticated scope', () => {
  const admitted = verifyScoped(scopedInput());
  assert.ok(admitted);
  assert.equal(admitted.verified, true);
  assert.equal(admitted.id, scopedPayload.id);
  assert.equal(admitted.tenantId, authenticatedScope.tenantId);
  assert.equal(Object.isFrozen(admitted), true);
});

test('validly signed cross-tenant, member or subscription events are rejected', () => {
  for (const field of ['tenantId', 'memberId', 'subscriptionId']) {
    assert.equal(verifyScoped(scopedInput({ ...scopedPayload, [field]: 'other' })), null, field);
    assert.equal(verifyScoped(scopedInput(scopedPayload, {
      authenticatedScope: { ...authenticatedScope, [field]: '' },
    })), null, field);
  }
  assert.equal(verifyScoped(scopedInput(scopedPayload, { authenticatedScope: null })), null);
});

test('scoped fixture rejects invalid signed JSON and client-declared verification', () => {
  for (const value of [[], null, { ...scopedPayload, verified: true },
    { ...scopedPayload, verified: false }, { ...scopedPayload, id: '' },
    { ...scopedPayload, type: '' }]) {
    assert.equal(verifyScoped(scopedInput(value)), null);
  }
  const invalidJson = Buffer.from('{not json}', 'utf8');
  assert.equal(verifyScoped(scopedInput(scopedPayload, {
    rawBody: invalidJson, signatureHeader: sign(invalidJson),
  })), null);
});

test('scope matching never overrides invalid signature or raw-byte tampering', () => {
  const input = scopedInput();
  assert.equal(verifyScoped({ ...input, rawBody: Buffer.from(JSON.stringify(scopedPayload) + '\\n') }), null);
  assert.equal(verifyScoped({ ...input, signatureHeader: sign(Buffer.from('{}')) }), null);
});
