import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMembershipInstants, projectMembershipEntitlement } from '../src/domain/membershipEntitlements.mjs';

// Synthetic, pre-verified events only. This is not provider signature verification.
const scope = { tenantId: 'tenant-offset', memberId: 'member-offset', subscriptionId: 'sub-offset' };
const paid = {
  ...scope, id: 'settled', type: 'payment_succeeded', verified: true,
  occurredAt: '2026-11-01T10:00:00Z', invoiceId: 'invoice-offset',
  settlementId: 'settlement-offset', periodEnd: '2026-12-01T10:00:00Z',
};

test('reject impossible timezone offsets before evaluating paid access', () => {
  for (const suffix of ['+14:01', '-14:30', '+00:60', '-23:00', '+99:00']) {
    const cancelled = {
      ...scope, id: 'cancel-offset', type: 'subscription_cancelled',
      verified: true, occurredAt: '2026-11-15T10:00:00' + suffix,
    };
    assert.throws(
      () => projectMembershipEntitlement(scope, [paid, cancelled], '2026-11-16T10:00:00Z'),
      /valid calendar timestamp|valid timestamp/,
      suffix,
    );
  }
});

test('equivalent legal +14 and -12 offsets compare as exact instants', () => {
  assert.equal(compareMembershipInstants('2026-11-16T00:00:00.000001+14:00', '2026-11-15T10:00:00.000001Z'), 0);
  assert.equal(compareMembershipInstants('2026-11-14T22:00:00.000001-12:00', '2026-11-15T10:00:00.000001Z'), 0);
  assert.equal(compareMembershipInstants('2026-11-15T10:00:00.000002Z', '2026-11-16T00:00:00.000001+14:00'), 1);
});
