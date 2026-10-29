import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixedMonthlyNoteSchedule } from '../server/services/noteAmortization.js';

const terms = { tenantId: 'tenant-a', entityId: 'trust-a', noteId: 'note-1', currency: 'USD',
  principalMinor: 1_200_000, annualRateBps: 600, paymentCount: 12, firstDueDate: '2026-01-31' };
const schedule = (overrides = {}) => buildFixedMonthlyNoteSchedule({ ...terms, ...overrides });

test('fully amortizes a positive-rate note without inventing cash receipts', () => {
  const result = schedule();
  assert.equal(result.installments.length, 12);
  assert.equal(result.installments.at(-1).remainingPrincipalMinor, 0);
  assert.equal(result.installments[0].interestMinor, 6_000);
  assert.equal(result.installments[0].principalMinor + result.installments[0].interestMinor, result.installments[0].paymentMinor);
  assert.equal(result.installments.reduce((sum, row) => sum + row.principalMinor, 0), terms.principalMinor);
  assert.equal(result.installments.reduce((sum, row) => sum + row.interestMinor, 0), result.totalInterestMinor);
  assert.equal(result.totalRepaymentMinor, terms.principalMinor + result.totalInterestMinor);
  assert.ok(result.totalInterestMinor > 0);
});

test('handles zero-interest notes with exact final adjustment', () => {
  const result = schedule({ principalMinor: 100, annualRateBps: 0, paymentCount: 3 });
  assert.deepEqual(result.installments.map(row => row.paymentMinor), [34, 34, 32]);
  assert.equal(result.totalInterestMinor, 0);
  assert.equal(result.totalRepaymentMinor, 100);
});

test('handles one-period notes and half-up monthly interest', () => {
  const result = schedule({ principalMinor: 101, annualRateBps: 60_000, paymentCount: 1 });
  assert.equal(result.installments[0].interestMinor, 51);
  assert.equal(result.installments[0].paymentMinor, 152);
  assert.equal(result.installments[0].remainingPrincipalMinor, 0);
});

test('anchors month-end dates to the original day, not the prior clamped day', () => {
  const result = schedule({ paymentCount: 4 });
  assert.deepEqual(result.installments.map(row => row.dueDate), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  const leap = schedule({ firstDueDate: '2028-01-31', paymentCount: 3 });
  assert.equal(leap.installments[1].dueDate, '2028-02-29');
});

test('rejects invalid dates and malformed terms', () => {
  for (const firstDueDate of ['2026-02-29', '2026-13-01', '2026-01-00', 'not a date', '2026-1-1']) {
    assert.throws(() => schedule({ firstDueDate }), /firstDueDate/);
  }
  assert.throws(() => buildFixedMonthlyNoteSchedule(null), /required/);
  assert.throws(() => schedule({ currency: 'usd' }), /currency/);
  assert.throws(() => schedule({ tenantId: '' }), /tenantId/);
});

test('rejects invalid or unsafe amounts, rate, and term lengths', () => {
  for (const principalMinor of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => schedule({ principalMinor }), /principalMinor/);
  }
  for (const annualRateBps of [-1, 1.5, 100_001]) {
    assert.throws(() => schedule({ annualRateBps }), /annualRateBps/);
  }
  for (const paymentCount of [0, -1, 1.5, 601]) {
    assert.throws(() => schedule({ paymentCount }), /paymentCount/);
  }
});

test('fails closed when calculated totals exceed safe integer range', () => {
  assert.throws(() => schedule({ principalMinor: Number.MAX_SAFE_INTEGER, annualRateBps: 10_000, paymentCount: 1 }), /safe integer range/);
});

test('produces immutable schedules and does not mutate input', () => {
  const input = { ...terms };
  const result = buildFixedMonthlyNoteSchedule(input);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.installments), true);
  assert.equal(Object.isFrozen(result.installments[0]), true);
  assert.deepEqual(input, terms);
});

test('rejects impossible terms that would produce zero-value future installments', () => {
  for (const overrides of [
    { principalMinor: 1, annualRateBps: 0, paymentCount: 12 },
    { principalMinor: 2, annualRateBps: 0, paymentCount: 3 },
    { principalMinor: 1, annualRateBps: 600, paymentCount: 12 },
  ]) {
    assert.throws(() => schedule(overrides), /zero-value future installments/);
  }
});

test('permits a one-cent single-installment note without inventing payments', () => {
  const input = { ...terms, principalMinor: 1, annualRateBps: 0, paymentCount: 1 };
  const result = buildFixedMonthlyNoteSchedule(input);
  assert.equal(result.installments.length, 1);
  assert.equal(result.installments[0].principalMinor, 1);
  assert.equal(result.installments[0].interestMinor, 0);
  assert.equal(result.installments.at(-1).remainingPrincipalMinor, 0);
  assert.equal(input.principalMinor, 1);
});
