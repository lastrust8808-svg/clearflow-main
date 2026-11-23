import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMembershipEntitlement as project } from '../src/domain/membershipEntitlements.mjs';

// Synthetic, already-verified fixtures only; this is not provider authentication.
const scope = { tenantId: 'tenant-future', memberId: 'member-future', subscriptionId: 'sub-future' };
const paid = {
  ...scope, id: 'paid', type: 'payment_succeeded', verified: true,
  occurredAt: '2026-11-01T00:00:00Z', invoiceId: 'invoice-1',
  settlementId: 'settlement-1', periodEnd: '2026-12-01T00:00:00Z',
};
const asOf = '2026-11-10T00:00:00Z';

test('future event with mismatched tenant cannot be hidden by historical asOf', () => {
  const future = {
    ...scope, id: 'future', type: 'subscription_cancelled', verified: true,
    occurredAt: '2027-01-01T00:00:00Z', tenantId: 'other-tenant',
  };
  assert.throws(() => project(scope, [paid, future], asOf), /scope mismatch/);
});

test('future unverified event cannot be hidden by historical asOf', () => {
  const future = {
    ...scope, id: 'future', type: 'subscription_cancelled', verified: false,
    occurredAt: '2027-01-01T00:00:00Z',
  };
  assert.throws(() => project(scope, [paid, future], asOf), /unverified/);
});

test('future conflicting settlement replay cannot be hidden by historical asOf', () => {
  const future = {
    ...paid, id: 'replayed', occurredAt: '2027-01-01T00:00:00Z',
    periodEnd: '2027-02-01T00:00:00Z',
  };
  assert.throws(() => project(scope, [paid, future], asOf), /conflicting settlement replay/);
});

test('valid future cancellation does not change historical paid access', () => {
  const future = {
    ...scope, id: 'future', type: 'subscription_cancelled', verified: true,
    occurredAt: '2027-01-01T00:00:00Z',
  };
  assert.equal(project(scope, [future, paid], asOf).status, 'active');
});
