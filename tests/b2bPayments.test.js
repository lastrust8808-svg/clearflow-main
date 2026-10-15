import test from 'node:test';
import assert from 'node:assert/strict';
import { validateB2BInvoice, createB2BPaymentInstruction, projectB2BInvoiceStatus } from '../server/services/b2bPayments.js';
const invoice = { id: 'inv-1', payerEntityId: 'aac', payeeEntityId: 'vendor', amount: 4500, currency: 'USD' };
const approval = { invoiceId: 'inv-1', payerEntityId: 'aac', amountCents: 450000, currency: 'USD', approved: true, actorId: 'owner', approvedAt: '2026-10-14T00:00:00Z' };
const capability = { enabled: true, method: 'ach', payerEntityId: 'aac' };
test('valid B2B invoice normalized into integer cents', () => {
  assert.equal(validateB2BInvoice(invoice).amountCents, 450000);
});
test('rejects same entity, negative or fractional cents', () => {
  assert.throws(() => validateB2BInvoice({ ...invoice, payeeEntityId: 'aac' }));
  assert.throws(() => validateB2BInvoice({ ...invoice, amount: -1 }));
  assert.throws(() => validateB2BInvoice({ ...invoice, amount: 1.001 }));
});
test('requires specific approval and provider capability before execution', () => {
  assert.throws(() => createB2BPaymentInstruction({ invoice, method: 'ach', payerApproval: { ...approval, amountCents: 1 }, providerCapability: capability }));
  assert.throws(() => createB2BPaymentInstruction({ invoice, method: 'ach', payerApproval: approval, providerCapability: { ...capability, enabled: false } }));
  assert.throws(() => createB2BPaymentInstruction({ invoice, method: 'rtp', payerApproval: approval, providerCapability: capability }));
  const instruction = createB2BPaymentInstruction({ invoice, method: 'ach', payerApproval: approval, providerCapability: capability });
  assert.equal(instruction.state, 'approved_not_submitted');
  assert.equal(instruction.settled, false);
});
test('unverified bank confirmation cannot close invoice', () => {
  const result = projectB2BInvoiceStatus({ invoice, bankConfirmation: { invoiceId: 'inv-1', status: 'settled' } });
  assert.equal(result.receivableOutstandingCents, 450000);
  assert.equal(result.settled, false);
});
test('settlement and reconciliation require matching provider evidence', () => {
  const bankConfirmation = { invoiceId: 'inv-1', payerEntityId: 'aac', payeeEntityId: 'vendor', amountCents: 450000, currency: 'USD', status: 'settled', providerTransactionId: 'tx-123' };
  const settled = projectB2BInvoiceStatus({ invoice, bankConfirmation });
  assert.equal(settled.settled, true);
  assert.equal(settled.reconciled, false);
  const reconciled = projectB2BInvoiceStatus({ invoice, bankConfirmation, reconciliation: { invoiceId: 'inv-1', providerTransactionId: 'tx-123', matched: true } });
  assert.equal(reconciled.reconciled, true);
  assert.equal(projectB2BInvoiceStatus({ invoice, bankConfirmation: { ...bankConfirmation, amountCents: 1 } }).settled, false);
});
