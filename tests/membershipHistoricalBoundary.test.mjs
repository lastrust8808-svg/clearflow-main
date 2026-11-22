import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMembershipEntitlement as project } from '../src/domain/membershipEntitlements.mjs';

// Historical entitlement reads must not apply a provider event before its
// effective instant. These are synthetic verified events, NOT provider proofs.
const scope = { tenantId: 'tenant-history', memberId: 'member-history', subscriptionId: 'sub-history' };
const event = (id, type, occurredAt, extra = {}) => ({
  ...scope, id, type, occurredAt, verified: true, ...extra,
});
const success = event('paid', 'payment_succeeded', '2026-11-01T10:00:00.000100Z', {
  invoiceId: 'invoice-1', settlementId: 'settlement-1',
  periodEnd: '2026-12-01T10:00:00.000100Z',
});

test('future cancellation is terminal only after its effective instant', () => {
  const cancel = event('cancel', 'subscription_cancelled', '2026-11-15T10:00:00.000200Z');
  const events = [cancel, success];
  assert.equal(project(scope, events, '2026-11-15T10:00:00.000199Z').status, 'active');
  assert.equal(project(scope, events, '2026-11-15T10:00:00.000200Z').status, 'cancelled');
  assert.equal(project(scope, events, '2026-11-15T10:00:00.000201Z').entitled, false);
});

test('future refund cannot revoke historical access at a submillisecond boundary', () => {
  const refund = event('refund', 'payment_refunded', '2026-11-15T10:00:00.000200Z', {
    invoiceId: 'invoice-1',
  });
  assert.equal(project(scope, [refund, success], '2026-11-15T10:00:00.000199Z').status, 'active');
  assert.equal(project(scope, [refund, success], '2026-11-15T10:00:00.000200Z').status, 'past_due');
});

test('future renewal cannot grant historical access before its own effective instant', () => {
  const renewal = event('renewal', 'payment_succeeded', '2026-12-01T10:00:00.000200Z', {
    invoiceId: 'invoice-2', settlementId: 'settlement-2',
    periodEnd: '2027-01-01T10:00:00.000200Z',
  });
  assert.equal(project(scope, [renewal, success], '2026-12-01T10:00:00.000150Z').status, 'expired');
  assert.equal(project(scope, [renewal, success], '2026-12-01T10:00:00.000200Z').status, 'active');
});

test('historical boundaries compare equivalent instants across timezone offsets', () => {
  const cancel = event('cancel-offset', 'subscription_cancelled', '2026-11-15T05:00:00.000200-05:00');
  assert.equal(project(scope, [cancel, success], '2026-11-15T10:00:00.000199Z').status, 'active');
  assert.equal(project(scope, [cancel, success], '2026-11-15T10:00:00.000200Z').status, 'cancelled');
});

test('offset-encoded future refunds do not revoke earlier UTC historical access', () => {
  const refund = event('refund-offset', 'payment_refunded', '2026-11-15T12:00:00.000200+02:00', {
    invoiceId: 'invoice-1',
  });
  assert.equal(project(scope, [refund, success], '2026-11-15T10:00:00.000199Z').status, 'active');
  assert.equal(project(scope, [refund, success], '2026-11-15T10:00:00.000200Z').status, 'past_due');
});
