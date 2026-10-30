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

test('signed fixture cannot promote unexpected entitlement, role, or provider claims', () => {
  for (const claim of [
    { entitled: true }, { role: 'owner' }, { paid: true },
    { providerVerified: true }, { __unexpected: 'value' },
  ]) {
    assert.equal(verifyScoped(scopedInput({ ...scopedPayload, ...claim })), null);
  }
  for (const type of ['unknown_event', 'toString', 'constructor', '__proto__']) {
    assert.equal(verifyScoped(scopedInput({ ...scopedPayload, type })), null, type);
  }
});

test('fixture admits only type-specific payment fields and required identities', () => {
  const base = {
    ...authenticatedScope, id: 'evt-valid', occurredAt: '2026-10-29T12:00:00Z',
  };
  for (const type of ['subscription_created', 'subscription_cancelled']) {
    assert.ok(verifyScoped(scopedInput({ ...base, type })), type);
    assert.equal(verifyScoped(scopedInput({ ...base, type, invoiceId: 'inv-test' })), null);
  }
  for (const type of ['payment_failed', 'payment_refunded']) {
    assert.ok(verifyScoped(scopedInput({ ...base, type, invoiceId: 'inv-test' })), type);
    assert.equal(verifyScoped(scopedInput({ ...base, type })), null);
    assert.equal(verifyScoped(scopedInput({ ...base, type, invoiceId: 'inv-test', periodEnd: '2026-11-29T12:00:00Z' })), null);
  }
  assert.ok(verifyScoped(scopedInput(scopedPayload)));
  for (const field of ['invoiceId', 'settlementId', 'periodEnd', 'occurredAt']) {
    const missing = { ...scopedPayload };
    delete missing[field];
    assert.equal(verifyScoped(scopedInput(missing)), null, field);
    assert.equal(verifyScoped(scopedInput({ ...scopedPayload, [field]: '' })), null, field);
  }
});

test('signed fixture rejects invalid calendar timestamps before event promotion', () => {
  for (const occurredAt of [
    '2026-02-30T12:00:00Z', '2026-10-29T24:00:00Z',
    '2026-10-29T12:60:00Z', '2026-10-29T12:00:00+24:00',
    '2026-10-29', 'not-a-date',
  ]) {
    assert.equal(verifyScoped(scopedInput({ ...scopedPayload, occurredAt })), null, occurredAt);
  }
  for (const periodEnd of [
    '2026-11-31T12:00:00Z', '2026-11-29T12:00:60Z',
    '2026-11-29T12:00:00-05:60', 'invalid',
  ]) {
    assert.equal(verifyScoped(scopedInput({ ...scopedPayload, periodEnd })), null, periodEnd);
  }
});

test('signed fixture requires paid-through after occurrence while accepting valid leap day', () => {
  for (const periodEnd of [
    scopedPayload.occurredAt, '2026-10-28T12:00:00Z',
    '2026-10-29T08:00:00-04:00',
  ]) {
    assert.equal(verifyScoped(scopedInput({ ...scopedPayload, periodEnd })), null, periodEnd);
  }
  assert.ok(verifyScoped(scopedInput({
    ...scopedPayload,
    occurredAt: '2028-02-28T12:00:00Z',
    periodEnd: '2028-02-29T12:00:00Z',
  })));
});

test('signed fixture rejects malformed UTF-8 bytes rather than normalizing event identity', () => {
  const valid = scopedBody(scopedPayload);
  const marker = Buffer.from('evt-scope-test');
  const at = valid.indexOf(marker);
  assert.ok(at >= 0);
  for (const invalid of [Buffer.from([0xff]), Buffer.from([0xc0, 0xaf]), Buffer.from([0xed, 0xa0, 0x80])]) {
    const body = Buffer.concat([
      valid.subarray(0, at),
      Buffer.from('evt-'),
      invalid,
      valid.subarray(at + marker.length),
    ]);
    // Signature matches the exact malformed bytes; decoding must still fail.
    assert.equal(verify({ ...input(), rawBody: body, signatureHeader: sign(body) }), true);
    assert.equal(verifyScoped(scopedInput(scopedPayload, {
      rawBody: body, signatureHeader: sign(body),
    })), null);
  }
  const unicode = { ...scopedPayload, id: 'evt-café' };
  assert.equal(verifyScoped(scopedInput(unicode)).id, unicode.id);
});


test('signed fixture rejects duplicate JSON object keys and escaped aliases', () => {
  const canonical = JSON.stringify(scopedPayload).slice(1);
  // The last duplicate matches the authenticated scope. JSON.parse alone
  // would silently discard the conflicting first occurrence.
  for (const firstField of [
    '"tenantId":"foreign-tenant"',
    '"\\u0074enantId":"foreign-tenant"',
    '"id":"evt-shadow"',
    '"periodEnd":"2099-01-01T00:00:00Z"',
  ]) {
    const body = Buffer.from(`{${firstField},${canonical}`, 'utf8');
    assert.equal(verify(input({ rawBody: body, signatureHeader: sign(body) })), true);
    assert.equal(verifyScoped(scopedInput(scopedPayload, {
      rawBody: body, signatureHeader: sign(body),
    })), null, firstField);
  }
  // Ordinary signed events remain accepted.
  assert.equal(verifyScoped(scopedInput(scopedPayload)).id, scopedPayload.id);
});

test('signed webhook fixture rejects oversized bodies before event admission', () => {
  const huge = Buffer.from('x'.repeat(65537), 'utf8');
  assert.equal(verify(input({ rawBody: huge, signatureHeader: sign(huge) })), false);
  assert.equal(verifyScoped(scopedInput(scopedPayload, {
    rawBody: huge, signatureHeader: sign(huge),
  })), null);
  const boundary = Buffer.alloc(65536, 0x20);
  assert.equal(verify(input({ rawBody: boundary, signatureHeader: sign(boundary) })), true);
});

test('signed string bodies with unpaired UTF-16 surrogates are rejected without aliasing identities', () => {
  for (const invalid of ['\\uD800', '\\uDC00', 'evt-\\uD800x', 'evt-\\uDC00x']) {
    const body = JSON.stringify(scopedPayload).replace('evt-scope-test', invalid);
    assert.equal(verify(input({ rawBody: body, signatureHeader: sign(body) })), false);
    assert.equal(verifyScoped(scopedInput(scopedPayload, {
      rawBody: body, signatureHeader: sign(body),
    })), null);
  }
  const valid = JSON.stringify({ ...scopedPayload, id: 'evt-\\uD83D\\uDE00' });
  assert.equal(verify(input({ rawBody: valid, signatureHeader: sign(valid) })), true);
  assert.ok(verifyScoped(scopedInput(scopedPayload, {
    rawBody: valid, signatureHeader: sign(valid),
  })));
});
