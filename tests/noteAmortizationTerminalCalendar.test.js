import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixedMonthlyNoteSchedule } from '../server/services/noteAmortization.js';

const terms = {
  tenantId: 'tenant-terminal-calendar', entityId: 'entity-terminal-calendar',
  trustId: 'trust-terminal-calendar', noteId: 'note-terminal-calendar',
  currency: 'USD', principalMinor: 60000, annualRateBps: 0,
  paymentCount: 600, firstDueDate: '9949-12-31',
};

test('maximum supported 600-month schedule ends in year 9999 without rolling over', () => {
  const result = buildFixedMonthlyNoteSchedule(terms);
  assert.equal(result.installments.length, 600);
  assert.equal(result.installments[0].dueDate, '9949-12-31');
  assert.equal(result.installments[1].dueDate, '9950-01-31');
  assert.equal(result.installments.at(-1).dueDate, '9999-11-30');
  assert.equal(result.installments.at(-1).remainingPrincipalMinor, 0);
  assert.equal(result.totalRepaymentMinor, 60000);
  assert.equal(result.totalInterestMinor, 0);
});

test('century non-leap February and following March retain original day anchor', () => {
  const result = buildFixedMonthlyNoteSchedule({
    ...terms, firstDueDate: '2099-12-31', paymentCount: 4, principalMinor: 400,
  });
  assert.deepEqual(result.installments.map(row => row.dueDate), [
    '2099-12-31', '2100-01-31', '2100-02-28', '2100-03-31',
  ]);
  assert.equal(result.installments.reduce((sum, row) => sum + row.principalMinor, 0), 400);
});
