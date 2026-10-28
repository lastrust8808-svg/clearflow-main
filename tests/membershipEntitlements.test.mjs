import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMembershipEntitlement as project } from '../src/domain/membershipEntitlements.mjs';

const scope = { tenantId: 'tenant-a', memberId: 'member-a', subscriptionId: 'sub-a' };
const asOf = '2026-10-28T21:00:00Z';
const event = (id, type, occurredAt = '2026-10-20T12:00:00Z', extra = {}) => ({
  ...scope, id, type, occurredAt, verified: true, ...extra,
});
const paid = (id = 'evt-paid', extra = {}) => event(id, 'payment_succeeded', '2026-10-20T12:00:00Z', {
  invoiceId: 'inv-1', settlementId: 'settle-1', periodEnd: '2026-11-20T12:00:00Z', ...extra,
});
const failed = (id = 'evt-failed', occurredAt = '2026-10-25T12:00:00Z') =>
  event(id, 'payment_failed', occurredAt, { invoiceId: 'inv-2' });

test('no events or subscription creation never grants entitlement', () => {
  assert.equal(project(scope, [], asOf).entitled, false);
  assert.equal(project(scope, [event('created', 'subscription_created')], asOf).status, 'pending');
});
test('verified settled payment activates only through its paid-through date', () => {
  const result = project(scope, [paid()], asOf);
  assert.equal(result.status, 'active');
  assert.equal(result.entitled, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(project(scope, [paid()], '2026-11-20T12:00:00Z').status, 'expired');
});
test('unverified event cannot activate entitlement', () => {
  assert.throws(() => project(scope, [paid('bad', { verified: false })], asOf), /unverified/);
});
test('duplicate provider delivery is idempotent', () => {
  const result = project(scope, [paid(), paid()], asOf);
  assert.equal(result.processedEvents, 1);
  assert.equal(result.status, 'active');
});
test('conflicting duplicate event ID fails closed', () => {
  assert.throws(() => project(scope, [paid(), paid('evt-paid', { settlementId: 'settle-2' })], asOf), /conflicting duplicate/);
});
test('out-of-order newer payment failure removes access', () => {
  assert.equal(project(scope, [failed(), paid()], asOf).status, 'past_due');
  assert.equal(project(scope, [failed(), paid()], asOf).entitled, false);
});
test('failure at same instant as success wins conservatively', () => {
  assert.equal(project(scope, [failed('failed-same', '2026-10-20T12:00:00Z'), paid()], asOf).status, 'past_due');
});
test('cancellation is terminal even with later settlement events', () => {
  const cancel = event('cancel', 'subscription_cancelled', '2026-10-22T12:00:00Z');
  const laterPaid = paid('later', { settlementId: 'settle-2', invoiceId: 'inv-3', periodEnd: '2026-12-20T12:00:00Z' });
  laterPaid.occurredAt = '2026-10-26T12:00:00Z';
  assert.equal(project(scope, [laterPaid, cancel, paid()], asOf).status, 'cancelled');
});
test('verified refund revokes access', () => {
  assert.equal(project(scope, [paid(), event('refund', 'payment_refunded', '2026-10-25T12:00:00Z', { invoiceId: 'inv-1' })], asOf).status, 'past_due');
});
test('cross-tenant, cross-member, and cross-subscription events are rejected', () => {
  for (const key of ['tenantId', 'memberId', 'subscriptionId']) {
    assert.throws(() => project(scope, [paid('bad', { [key]: 'another' })], asOf), /scope mismatch/);
  }
});
test('a settlement cannot be reused across different invoices', () => {
  assert.throws(() => project(scope, [paid(), paid('again', { invoiceId: 'inv-2' })], asOf), /settlement reused/);
});
test('future events cannot grant access early', () => {
  const future = paid('future', { periodEnd: '2026-12-20T12:00:00Z' });
  future.occurredAt = '2026-11-20T12:00:00Z';
  assert.equal(project(scope, [future], asOf).status, 'pending');
});
test('unknown event types fail closed', () => {
  assert.throws(() => project(scope, [event('unknown', 'free_trial_granted')], asOf), /unsupported/);
});
test('malformed period and timestamps fail closed', () => {
  assert.throws(() => project(scope, [paid('bad', { periodEnd: '2026-10-19T12:00:00Z' })], asOf), /period must end/);
  assert.throws(() => project(scope, [paid()], '2026-10-28'), /timezone/);
});
test('invalid input and missing payment settlement fail closed', () => {
  assert.throws(() => project(scope, {}, asOf), /events must be an array/);
  assert.throws(() => project(scope, [paid('bad', { settlementId: '' })], asOf), /settlementId/);
});
