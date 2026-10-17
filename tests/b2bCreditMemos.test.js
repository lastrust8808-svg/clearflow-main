import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreditMemo } from '../server/services/b2bCreditMemos.js';
const invoice = { id: 'inv1', payerEntityId: 'payer', payeeEntityId: 'seller', amountCents: 10000, currency: 'USD' };
test('credit memo is bounded, non-settling and preserves invoice identity', () => {
  const memo = validateCreditMemo(invoice, { id: 'cm1', amountCents: 2500, reason: 'Price correction' });
  assert.equal(memo.amountCents, 2500);
  assert.equal(memo.invoiceId, 'inv1');
  assert.equal(memo.settled, false);
  assert.ok(Object.isFrozen(memo));
});
test('rejects invalid, negative, fractional, and over-invoice credits', () => {
  for (const amountCents of [0, -1, 10001, 0.5, NaN]) {
    assert.throws(() => validateCreditMemo(invoice, { id: 'cm1', amountCents, reason: 'Price correction' }));
  }
});
