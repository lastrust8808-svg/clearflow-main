import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixedMonthlyNoteSchedule } from '../server/services/noteAmortization.js';

const base = Object.freeze({
  tenantId: 'tenant-overflow', entityId: 'entity-overflow',
  trustId: 'trust-overflow', noteId: 'note-overflow', currency: 'USD',
  principalMinor: Number.MAX_SAFE_INTEGER, annualRateBps: 100_000,
  paymentCount: 1, firstDueDate: '2028-02-29',
});

test('large interest-bearing note cannot emit unsafe monetary totals', () => {
  assert.throws(() => buildFixedMonthlyNoteSchedule(base), RangeError);
});

test('maximum safe principal remains representable for zero-interest one-payment note', () => {
  const schedule = buildFixedMonthlyNoteSchedule({ ...base, annualRateBps: 0 });
  assert.equal(schedule.scheduledPaymentMinor, Number.MAX_SAFE_INTEGER);
  assert.equal(schedule.totalRepaymentMinor, Number.MAX_SAFE_INTEGER);
  assert.equal(schedule.totalInterestMinor, 0);
  assert.equal(schedule.installments[0].remainingPrincipalMinor, 0);
  assert.ok(Object.isFrozen(schedule.installments[0]));
});

test('a representable principal can still overflow the repayment total', () => {
  const principalMinor = Number.MAX_SAFE_INTEGER - 1_000_000;
  assert.throws(
    () => buildFixedMonthlyNoteSchedule({ ...base, principalMinor }),
    RangeError,
  );
});
