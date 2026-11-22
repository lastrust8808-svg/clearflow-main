import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMembershipInstant, compareMembershipInstants, projectMembershipEntitlement } from '../src/domain/membershipEntitlements.mjs';

const scope = { tenantId: 'tenant-a', memberId: 'member-a', subscriptionId: 'sub-a' };
const payment = {
  id: 'event-a', type: 'payment_succeeded', tenantId: scope.tenantId,
  memberId: scope.memberId, subscriptionId: scope.subscriptionId,
  verified: true, invoiceId: 'invoice-a', settlementId: 'settlement-a',
  occurredAt: '2026-11-22T12:00:00Z', periodEnd: '2026-12-22T12:00:00Z',
};

test('unknown RFC3339 offset cannot establish an entitlement instant', () => {
  assert.throws(() => parseMembershipInstant('2026-11-22T12:00:00-00:00'), /valid calendar timestamp/);
  assert.throws(() => compareMembershipInstants('2026-11-22T12:00:00-00:00', payment.occurredAt), /valid calendar timestamp/);
  assert.equal(compareMembershipInstants('2026-11-22T12:00:00+00:00', payment.occurredAt), 0);
});

test('unknown offset fails closed in event, paid-through, and as-of fields', () => {
  for (const field of ['occurredAt', 'periodEnd']) {
    assert.throws(() => projectMembershipEntitlement(scope, [{ ...payment, [field]: '2026-11-22T12:00:00-00:00' }], '2026-11-23T00:00:00Z'), /valid calendar timestamp/);
  }
  assert.throws(() => projectMembershipEntitlement(scope, [payment], '2026-11-23T00:00:00-00:00'), /valid calendar timestamp/);
});
