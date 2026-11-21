import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixedMonthlyNoteSchedule } from '../server/services/noteAmortization.js';

const terms = {
  tenantId: 'tenant-1', entityId: 'entity-1', trustId: 'trust-1',
  noteId: 'note-1', currency: 'USD', principalMinor: 120000,
  annualRateBps: 0, paymentCount: 12, firstDueDate: '2028-02-29'
};

test('leap-day due dates clamp to month end without drifting subsequent months', () => {
  const result = buildFixedMonthlyNoteSchedule(terms);
  assert.deepEqual(result.installments.slice(0, 5).map(x => x.dueDate), [
    '2028-02-29', '2028-03-29', '2028-04-29', '2028-05-29', '2028-06-29'
  ]);
  const january = buildFixedMonthlyNoteSchedule({...terms, firstDueDate: '2027-01-31'});
  assert.deepEqual(january.installments.slice(0, 4).map(x => x.dueDate), [
    '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'
  ]);
});

test('rounded zero-interest installments conserve principal and final installment adjusts', () => {
  const result = buildFixedMonthlyNoteSchedule({...terms, principalMinor: 10001, paymentCount: 3});
  assert.deepEqual(result.installments.map(x => x.paymentMinor), [3334, 3334, 3333]);
  assert.equal(result.installments.reduce((sum, x) => sum + x.principalMinor, 0), 10001);
  assert.equal(result.installments.at(-1).remainingPrincipalMinor, 0);
  assert.equal(result.totalRepaymentMinor, 10001);
});

test('projected total repayment exceeding safe minor-unit range fails closed', () => {
  assert.throws(
    () => buildFixedMonthlyNoteSchedule({...terms, principalMinor: Number.MAX_SAFE_INTEGER, annualRateBps: 100000, paymentCount: 12}),
    {name: 'RangeError'}
  );
});


test('Gregorian century leap rules reject invalid dates and preserve valid February anchors', () => {
  for (const firstDueDate of ['1900-02-29', '2100-02-29', '2027-02-29', '2028-04-31']) {
    assert.throws(() => buildFixedMonthlyNoteSchedule({...terms, firstDueDate}), {name: 'RangeError'});
  }
  const leapCentury = buildFixedMonthlyNoteSchedule({...terms, firstDueDate: '2000-02-29', paymentCount: 3});
  assert.deepEqual(leapCentury.installments.map(x => x.dueDate), [
    '2000-02-29', '2000-03-29', '2000-04-29'
  ]);
  const nonLeapCentury = buildFixedMonthlyNoteSchedule({...terms, firstDueDate: '2100-02-28', paymentCount: 3});
  assert.deepEqual(nonLeapCentury.installments.map(x => x.dueDate), [
    '2100-02-28', '2100-03-28', '2100-04-28'
  ]);
});


test('interest-bearing schedule conserves every minor unit without claiming payments occurred', () => {
  const schedule = buildFixedMonthlyNoteSchedule({
    ...terms, principalMinor: 100_003, annualRateBps: 725, paymentCount: 24,
    firstDueDate: '2028-01-31',
  });
  let outstanding = schedule.principalMinor;
  let principalSum = 0;
  let interestSum = 0;
  for (const [index, installment] of schedule.installments.entries()) {
    assert.equal(installment.installmentNumber, index + 1);
    assert.equal(installment.paymentMinor, installment.principalMinor + installment.interestMinor);
    assert.ok(installment.principalMinor > 0);
    assert.ok(installment.interestMinor >= 0);
    assert.ok(installment.principalMinor <= outstanding);
    outstanding -= installment.principalMinor;
    assert.equal(installment.remainingPrincipalMinor, outstanding);
    principalSum += installment.principalMinor;
    interestSum += installment.interestMinor;
  }
  assert.equal(outstanding, 0);
  assert.equal(principalSum, schedule.principalMinor);
  assert.equal(interestSum, schedule.totalInterestMinor);
  assert.equal(principalSum + interestSum, schedule.totalRepaymentMinor);
  assert.equal(Object.hasOwn(schedule, 'paidMinor'), false);
  assert.equal(Object.hasOwn(schedule, 'settled'), false);
  assert.ok(Object.isFrozen(schedule));
  assert.ok(Object.isFrozen(schedule.installments));
});

test('single-period interest is rounded half-up and never dropped from the payoff', () => {
  // 1,000 minor units at 6% nominal annual yields exactly 5 minor units
  // of monthly interest; a half-unit tie must round up.
  for (const [principalMinor, expectedInterest] of [[1000, 5], [100, 1], [99, 0]]) {
    const schedule = buildFixedMonthlyNoteSchedule({
      ...terms, principalMinor, annualRateBps: 600, paymentCount: 1,
    });
    assert.equal(schedule.installments.length, 1);
    assert.equal(schedule.installments[0].principalMinor, principalMinor);
    assert.equal(schedule.installments[0].interestMinor, expectedInterest);
    assert.equal(schedule.installments[0].paymentMinor, principalMinor + expectedInterest);
    assert.equal(schedule.totalInterestMinor, expectedInterest);
    assert.equal(schedule.totalRepaymentMinor, principalMinor + expectedInterest);
    assert.equal(schedule.installments[0].remainingPrincipalMinor, 0);
  }
});
