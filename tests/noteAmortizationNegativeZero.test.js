import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixedMonthlyNoteSchedule } from '../server/services/noteAmortization.js';

const valid = Object.freeze({
  tenantId: 'tenant-1', entityId: 'entity-1', trustId: 'trust-1',
  noteId: 'note-1', currency: 'USD', principalMinor: 120000,
  annualRateBps: 0, paymentCount: 12, firstDueDate: '2026-12-01'
});

test('negative-zero note amounts, rates, and periods fail closed', () => {
  for (const field of ['principalMinor', 'annualRateBps', 'paymentCount']) {
    assert.throws(
      () => buildFixedMonthlyNoteSchedule({...valid, [field]: -0}),
      {name: 'RangeError'},
      field + ' must not silently canonicalize negative zero'
    );
  }
});

test('ordinary zero interest remains a valid non-posting schedule', () => {
  const result = buildFixedMonthlyNoteSchedule({...valid});
  assert.equal(result.annualRateBps, 0);
  assert.equal(result.installments.length, 12);
  assert.equal(result.totalRepaymentMinor, 120000);
});
