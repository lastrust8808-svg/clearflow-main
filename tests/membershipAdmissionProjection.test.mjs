import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyScopedMembershipWebhookFixture } from '../src/domain/membershipWebhookFixture.mjs';
import { projectMembershipEntitlement } from '../src/domain/membershipEntitlements.mjs';

// Offline acceptance contract across fixture signature admission and entitlement
// projection. This does NOT authenticate a real billing provider, persist events,
// post ledger entries, or authorize a production membership.
const secret = 'test-only-admission-projection-secret-32-bytes';
const nowSeconds = 1793270400;
const scope = Object.freeze({
  tenantId: 'tenant-integration', memberId: 'member-integration',
  subscriptionId: 'subscription-integration',
});
const asOf = '2026-11-03T00:00:00Z';
const payment = (id, invoiceId, settlementId, occurredAt, periodEnd) => ({
  ...scope, id, type: 'payment_succeeded', invoiceId, settlementId,
  occurredAt, periodEnd,
});
const event = (id, type, occurredAt, invoiceId) => ({
  ...scope, id, type, occurredAt, ...(invoiceId ? { invoiceId } : {}),
});
function signedFixture(payload, overrides = {}) {
  const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
  const timestamp = String(nowSeconds);
  const signatureHeader = 't=' + timestamp + ',v1=' +
    createHmac('sha256', secret).update(timestamp + '.').update(rawBody).digest('hex');
  return { rawBody, signatureHeader, secret, nowSeconds, authenticatedScope: scope, ...overrides };
}
function admit(payload, overrides) {
  return verifyScopedMembershipWebhookFixture(signedFixture(payload, overrides));
}
const initial = payment('evt-paid-1', 'inv-1', 'settle-1',
  '2026-10-29T12:00:00Z', '2026-11-29T12:00:00Z');
const renewal = payment('evt-paid-2', 'inv-2', 'settle-2',
  '2026-10-31T12:00:00Z', '2026-12-29T12:00:00Z');

test('only a signed, tenant-bound paid event can grant an offline projected entitlement', () => {
  const verified = admit(initial);
  assert.equal(verified?.verified, true);
  assert.equal(Object.isFrozen(verified), true);
  const result = projectMembershipEntitlement(scope, [verified], asOf);
  assert.equal(result.status, 'active');
  assert.equal(result.entitled, true);
  assert.equal(result.periodEnd, initial.periodEnd);

  const unverified = { ...initial, verified: false };
  assert.throws(() => projectMembershipEntitlement(scope, [unverified], asOf),
    /unverified membership event/);
  assert.equal(projectMembershipEntitlement(scope, [], asOf).entitled, false);
});

test('tampered signature, cross-tenant identity and client verified claims never cross admission', () => {
  const fixture = signedFixture(initial);
  const tampered = { ...fixture, rawBody: Buffer.from(JSON.stringify({ ...initial, periodEnd: '2099-01-01T00:00:00Z' })) };
  assert.equal(verifyScopedMembershipWebhookFixture(tampered), null);
  assert.equal(admit({ ...initial, tenantId: 'foreign-tenant' }), null);
  assert.equal(admit(initial, { authenticatedScope: { ...scope, memberId: 'foreign-member' } }), null);
  assert.equal(admit({ ...initial, verified: true }), null);
  assert.equal(admit({ ...initial, entitled: true }), null);
});

test('signed replay is idempotent in projection and conflicting settlement reuse is rejected', () => {
  const first = admit(initial);
  const replay = admit(initial);
  assert.ok(first && replay);
  const once = projectMembershipEntitlement(scope, [first, replay], asOf);
  assert.equal(once.processedEvents, 1);
  assert.equal(once.entitled, true);

  const sameSettlement = admit({ ...initial, id: 'evt-duplicate-delivery' });
  const deduped = projectMembershipEntitlement(scope, [first, sameSettlement], asOf);
  assert.equal(deduped.processedEvents, 1);

  const conflicting = admit({ ...initial, id: 'evt-conflicting', settlementId: 'settle-other' });
  assert.throws(() => projectMembershipEntitlement(scope, [first, conflicting], asOf),
    /invoice has multiple successful settlements/);
});

test('out-of-order signed refund for older invoice cannot erase independent renewal', () => {
  const oldRefund = admit(event('evt-old-refund', 'payment_refunded',
    '2026-11-01T12:00:00Z', 'inv-1'));
  const result = projectMembershipEntitlement(scope, [oldRefund, admit(renewal), admit(initial)], asOf);
  assert.equal(result.status, 'active');
  assert.equal(result.periodEnd, renewal.periodEnd);

  const currentRefund = admit(event('evt-current-refund', 'payment_refunded',
    '2026-11-02T12:00:00Z', 'inv-2'));
  assert.equal(projectMembershipEntitlement(scope,
    [admit(initial), admit(renewal), currentRefund], asOf).entitled, false);
});

test('signed unpaid renewal fails closed and cancellation stays terminal', () => {
  const failedRenewal = admit(event('evt-failed-renewal', 'payment_failed',
    '2026-11-01T12:00:00Z', 'inv-3'));
  const failed = projectMembershipEntitlement(scope, [admit(initial), failedRenewal], asOf);
  assert.equal(failed.status, 'past_due');
  assert.equal(failed.entitled, false);

  const cancelled = admit(event('evt-cancelled', 'subscription_cancelled',
    '2026-11-01T12:00:00Z'));
  const afterCancel = admit(payment('evt-after-cancel', 'inv-4', 'settle-4',
    '2026-11-02T12:00:00Z', '2027-01-01T12:00:00Z'));
  const result = projectMembershipEntitlement(scope,
    [afterCancel, admit(initial), cancelled], asOf);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.entitled, false);
});
