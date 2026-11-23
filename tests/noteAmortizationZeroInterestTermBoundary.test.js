import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixedMonthlyNoteSchedule } from '../server/services/noteAmortization.js';

const base = Object.freeze({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  noteId: 'note-a', currency: 'USD', principalMinor: 12,
  annualRateBps: 0, paymentCount: 12, firstDueDate: '2028-01-31',
});

test('zero-interest exact division produces twelve positive installments without fictional payment state', () => {
  const result = buildFixedMonthlyNoteSchedule(base);
  assert.equal(result.scheduledPaymentMinor, 1);
  assert.deepEqual(result.installments.map(x => x.paymentMinor), Array(12).fill(1));
  assert.deepEqual(result.installments.map(x => x.remainingPrincipalMinor), [11,10,9,8,7,6,5,4,3,2,1,0]);
  assert.equal(result.totalInterestMinor, 0);
  assert.equal(result.totalRepaymentMinor, 12);
  assert.equal(Object.hasOwn(result, 'paid'), false);
  assert.equal(Object.hasOwn(result, 'settled'), false);
});

test('zero-interest terms cannot create more installments than available minor units', () => {
  for (const principalMinor of [1, 2, 11]) {
    assert.throws(
      () => buildFixedMonthlyNoteSchedule({...base, principalMinor}),
      { name: 'RangeError', message: /zero-value future installments/ },
    );
  }
  const valid = buildFixedMonthlyNoteSchedule({...base, principalMinor: 11, paymentCount: 11});
  assert.equal(valid.installments.length, 11);
  assert.equal(valid.installments.at(-1).remainingPrincipalMinor, 0);
});
