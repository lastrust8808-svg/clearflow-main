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
