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
test('duplicate settlement under distinct provider event IDs is processed once', () => {
  const result = project(scope, [paid('evt-one'), paid('evt-two')], asOf);
  assert.equal(result.status, 'active');
  assert.equal(result.processedEvents, 1);
});
test('settlement replay cannot silently extend the membership period', () => {
  assert.throws(
    () => project(scope, [paid('evt-one'), paid('evt-two', { periodEnd: '2027-11-20T12:00:00Z' })], asOf),
    /conflicting settlement replay/,
  );
});
test('settlement replay cannot silently change its effective payment time', () => {
  const replay = paid('evt-two');
  replay.occurredAt = '2026-10-21T12:00:00Z';
  assert.throws(() => project(scope, [paid('evt-one'), replay], asOf), /conflicting settlement replay/);
});
test('settlement replay cannot hide a conflicting provider event ID', () => {
  const alias = paid('evt-alias');
  assert.throws(
    () => project(scope, [paid('evt-one'), alias, paid('evt-alias', { settlementId: 'settle-2' })], asOf),
    /conflicting duplicate membership event/,
  );
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
test('one monthly invoice cannot be settled twice under different settlement IDs', () => {
  assert.throws(
    () => project(scope, [paid('first'), paid('second', { settlementId: 'settle-2' })], asOf),
    /invoice has multiple successful settlements/,
  );
});
test('a second settlement cannot extend an already paid invoice period', () => {
  assert.throws(
    () => project(scope, [paid('first'), paid('second', {
      settlementId: 'settle-2', periodEnd: '2026-12-20T12:00:00Z',
    })], asOf),
    /invoice has multiple successful settlements/,
  );
});
test('distinct monthly invoices can each settle once', () => {
  const second = paid('second', {
    invoiceId: 'inv-2', settlementId: 'settle-2', periodEnd: '2026-12-20T12:00:00Z',
  });
  second.occurredAt = '2026-11-20T12:00:00Z';
  const result = project(scope, [second, paid()], '2026-11-25T12:00:00Z');
  assert.equal(result.status, 'active');
  assert.equal(result.periodEnd, '2026-12-20T12:00:00Z');
  assert.equal(result.processedEvents, 2);
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

test('invalid calendar dates cannot extend a paid-through entitlement', () => {
  assert.throws(() => project(scope, [paid('bad', { periodEnd: '2026-11-31T12:00:00Z' })], asOf), /calendar timestamp/);
  assert.throws(() => project(scope, [paid()], '2026-02-30T12:00:00Z'), /calendar timestamp/);
});

test('invalid event times and timezone offsets fail closed', () => {
  const invalid = ['2026-10-20T24:00:00Z', '2026-10-20T12:60:00Z',
    '2026-10-20T12:00:60Z', '2026-10-20T12:00:00+24:00',
    '2026-10-20T12:00:00-05:60'];
  for (const occurredAt of invalid) {
    assert.throws(() => project(scope, [event('bad', 'subscription_created', occurredAt)], asOf),
      /calendar timestamp/, occurredAt);
  }
});

test('valid leap days and timezone-offset instants remain supported', () => {
  const leapPaid = paid('leap', { periodEnd: '2028-02-29T12:00:00+05:30' });
  assert.equal(project(scope, [leapPaid], asOf).status, 'active');
  assert.equal(project(scope, [leapPaid], '2028-02-29T06:30:00Z').status, 'expired');
  assert.throws(() => project(scope, [paid('invalid', { periodEnd: '2027-02-29T12:00:00Z' })], asOf),
    /calendar timestamp/);
});


test('out-of-order success cannot reactivate an invoice already refunded', () => {
  const refund = event('refund-before-success', 'payment_refunded', '2026-10-19T12:00:00Z', { invoiceId: 'inv-1' });
  const result = project(scope, [paid(), refund], asOf);
  assert.equal(result.status, 'past_due');
  assert.equal(result.entitled, false);
});

test('a distinct later settled invoice can restore access after an older invoice refund', () => {
  const refund = event('refund-before-success', 'payment_refunded', '2026-10-19T12:00:00Z', { invoiceId: 'inv-1' });
  const next = paid('new-invoice', { invoiceId: 'inv-2', settlementId: 'settle-2', periodEnd: '2026-12-20T12:00:00Z' });
  next.occurredAt = '2026-10-25T12:00:00Z';
  const result = project(scope, [next, paid(), refund], asOf);
  assert.equal(result.status, 'active');
  assert.equal(result.entitled, true);
  assert.equal(result.periodEnd, '2026-12-20T12:00:00Z');
});

test('future refund does not retroactively revoke entitlement before its effective time', () => {
  const futureRefund = event('future-refund', 'payment_refunded', '2026-11-10T12:00:00Z', { invoiceId: 'inv-1' });
  assert.equal(project(scope, [futureRefund, paid()], asOf).status, 'active');
  assert.equal(project(scope, [futureRefund, paid()], '2026-11-11T12:00:00Z').status, 'past_due');
});

test('late refund for an older invoice cannot revoke a distinct newer paid invoice', () => {
  const next = paid('new-payment', {
    invoiceId: 'inv-2', settlementId: 'settle-2', periodEnd: '2026-12-20T12:00:00Z',
  });
  next.occurredAt = '2026-10-25T12:00:00Z';
  const oldRefund = event('late-old-refund', 'payment_refunded', '2026-10-27T12:00:00Z', {
    invoiceId: 'inv-1',
  });
  const result = project(scope, [oldRefund, next, paid()], asOf);
  assert.equal(result.status, 'active');
  assert.equal(result.entitled, true);
  assert.equal(result.periodEnd, '2026-12-20T12:00:00Z');
});

test('refunded older invoice replay cannot override an already active newer invoice', () => {
  const next = paid('new-payment', {
    invoiceId: 'inv-2', settlementId: 'settle-2', periodEnd: '2026-12-20T12:00:00Z',
  });
  next.occurredAt = '2026-10-18T12:00:00Z';
  const oldRefund = event('old-refund', 'payment_refunded', '2026-10-19T12:00:00Z', {
    invoiceId: 'inv-1',
  });
  const result = project(scope, [paid(), oldRefund, next], asOf);
  assert.equal(result.status, 'active');
  assert.equal(result.periodEnd, '2026-12-20T12:00:00Z');
});

test('refund of the only paid invoice still revokes access', () => {
  const next = paid('new-payment', {
    invoiceId: 'inv-2', settlementId: 'settle-2', periodEnd: '2026-12-20T12:00:00Z',
  });
  next.occurredAt = '2026-10-25T12:00:00Z';
  const refund = event('refund-current', 'payment_refunded', '2026-10-27T12:00:00Z', {
    invoiceId: 'inv-2',
  });
  const result = project(scope, [next, refund], asOf);
  assert.equal(result.status, 'past_due');
  assert.equal(result.entitled, false);
});

test('delayed failure of a superseded paid invoice cannot revoke a newer paid period', () => {
  const renewal = paid('renewal', {
    invoiceId: 'inv-2', settlementId: 'settle-2', periodEnd: '2026-12-20T12:00:00Z',
  });
  renewal.occurredAt = '2026-10-25T12:00:00Z';
  const oldFailure = event('old-failure', 'payment_failed', '2026-10-27T12:00:00Z', {
    invoiceId: 'inv-1',
  });
  const result = project(scope, [oldFailure, renewal, paid()], asOf);
  assert.equal(result.status, 'active');
  assert.equal(result.entitled, true);
  assert.equal(result.periodEnd, '2026-12-20T12:00:00Z');
});

test('same-instant old invoice failure cannot override independent renewal', () => {
  const renewal = paid('renewal-same-time', {
    invoiceId: 'inv-2', settlementId: 'settle-2', periodEnd: '2026-12-20T12:00:00Z',
  });
  renewal.occurredAt = '2026-10-25T12:00:00Z';
  const oldFailure = event('old-failure-same-time', 'payment_failed', '2026-10-25T12:00:00Z', {
    invoiceId: 'inv-1',
  });
  const result = project(scope, [oldFailure, renewal, paid()], asOf);
  assert.equal(result.status, 'active');
  assert.equal(result.periodEnd, '2026-12-20T12:00:00Z');
});

test('failure of currently paid invoice still revokes entitlement', () => {
  const currentFailure = event('current-failure', 'payment_failed', '2026-10-27T12:00:00Z', {
    invoiceId: 'inv-1',
  });
  const result = project(scope, [paid(), currentFailure], asOf);
  assert.equal(result.status, 'past_due');
  assert.equal(result.entitled, false);
});

test('a later paid invoice cannot silently shorten an active paid-through period', () => {
  const shorterRenewal = paid('shorter-renewal', {
    invoiceId: 'inv-2', settlementId: 'settle-2', periodEnd: '2026-11-10T12:00:00Z',
  });
  shorterRenewal.occurredAt = '2026-10-25T12:00:00Z';
  assert.throws(
    () => project(scope, [shorterRenewal, paid()], asOf),
    /payment period regresses existing entitlement/,
  );
});

test('distinct paid invoices may preserve or extend the verified paid-through date', () => {
  const sameEnd = paid('same-end-renewal', {
    invoiceId: 'inv-2', settlementId: 'settle-2', periodEnd: '2026-11-20T12:00:00Z',
  });
  sameEnd.occurredAt = '2026-10-25T12:00:00Z';
  const extended = paid('extended-renewal', {
    invoiceId: 'inv-3', settlementId: 'settle-3', periodEnd: '2026-12-20T12:00:00Z',
  });
  extended.occurredAt = '2026-10-27T12:00:00Z';
  assert.equal(project(scope, [sameEnd, paid()], asOf).status, 'active');
  const result = project(scope, [extended, paid(), sameEnd], asOf);
  assert.equal(result.status, 'active');
  assert.equal(result.periodEnd, '2026-12-20T12:00:00Z');
});
