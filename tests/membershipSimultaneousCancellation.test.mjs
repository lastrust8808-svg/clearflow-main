import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMembershipEntitlement as project } from '../src/domain/membershipEntitlements.mjs';

// Synthetic verified fixtures only; no production webhook authentication implied.
const scope = { tenantId: 'tenant-tie', memberId: 'member-tie', subscriptionId: 'sub-tie' };
const event = (id, type, occurredAt, extra = {}) =>
  ({ ...scope, id, type, occurredAt, verified: true, ...extra });

test('cancellation wins a same-instant settlement regardless of input ordering and offset', () => {
  const payment = event('paid', 'payment_succeeded', '2026-11-22T12:00:00.000100Z', {
    invoiceId: 'invoice-1', settlementId: 'settlement-1',
    periodEnd: '2026-12-22T12:00:00.000100Z',
  });
  const cancel = event('cancel', 'subscription_cancelled', '2026-11-22T07:00:00.000100-05:00');
  for (const events of [[payment, cancel], [cancel, payment]]) {
    assert.equal(project(scope, events, '2026-11-22T12:00:00.000099Z').entitled, false);
    const result = project(scope, events, '2026-11-22T12:00:00.000100Z');
    assert.equal(result.status, 'cancelled');
    assert.equal(result.entitled, false);
  }
});

test('cancellation a microsecond after settlement permits access only before cancellation', () => {
  const payment = event('paid', 'payment_succeeded', '2026-11-22T12:00:00.000100Z', {
    invoiceId: 'invoice-1', settlementId: 'settlement-1',
    periodEnd: '2026-12-22T12:00:00.000100Z',
  });
  const cancel = event('cancel', 'subscription_cancelled', '2026-11-22T07:00:00.000101-05:00');
  assert.equal(project(scope, [cancel, payment], '2026-11-22T12:00:00.000100Z').entitled, true);
  assert.equal(project(scope, [payment, cancel], '2026-11-22T12:00:00.000101Z').status, 'cancelled');
});
