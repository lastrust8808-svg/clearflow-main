import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixedMonthlyNoteSchedule } from '../server/services/noteAmortization.js';

const base = {
  tenantId: 'tenant-rounding', entityId: 'entity-rounding',
  trustId: 'trust-rounding', noteId: 'note-rounding', currency: 'USD',
  principalMinor: 100, annualRateBps: 600, paymentCount: 1,
  firstDueDate: '2028-02-29',
};

test('monthly interest rounds exact half-minor-unit upward, not bankers rounding', () => {
  // 100 minor units * 600 bps / 120000 = exactly 0.5 minor unit.
  const schedule = buildFixedMonthlyNoteSchedule(base);
  assert.equal(schedule.installments[0].interestMinor, 1);
  assert.equal(schedule.installments[0].principalMinor, 100);
  assert.equal(schedule.installments[0].paymentMinor, 101);
  assert.equal(schedule.totalInterestMinor, 1);
  assert.equal(schedule.totalRepaymentMinor, 101);
  assert.equal(schedule.installments[0].remainingPrincipalMinor, 0);
});

test('monthly interest below half-minor-unit rounds down without phantom interest', () => {
  const schedule = buildFixedMonthlyNoteSchedule({ ...base, principalMinor: 99 });
  assert.equal(schedule.installments[0].interestMinor, 0);
  assert.equal(schedule.installments[0].paymentMinor, 99);
  assert.equal(schedule.totalInterestMinor, 0);
  assert.equal(schedule.totalRepaymentMinor, 99);
});

test('rounded monthly interest remains a projection, not a payment receipt', () => {
  const schedule = buildFixedMonthlyNoteSchedule(base);
  for (const forbidden of ['paid', 'settled', 'executed', 'paymentReceived', 'receiptId']) {
    assert.equal(Object.hasOwn(schedule, forbidden), false);
    assert.equal(Object.hasOwn(schedule.installments[0], forbidden), false);
  }
  assert.ok(Object.isFrozen(schedule));
  assert.ok(Object.isFrozen(schedule.installments[0]));
});
