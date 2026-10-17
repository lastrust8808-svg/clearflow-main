import test from 'node:test';
import assert from 'node:assert/strict';
import { createB2BPaymentInstruction, projectB2BInvoiceStatus } from '../server/services/b2bPayments.js';

const invoice = { id: 'inv-tenant-a', payerEntityId: 'payer-a', payeeEntityId: 'payee-a', amount: 125.25, currency: 'USD' };
const approval = { invoiceId: invoice.id, payerEntityId: invoice.payerEntityId, amountCents: 12525, currency: 'USD', approved: true, actorId: 'payer-admin', approvedAt: '2026-10-17T00:00:00Z' };
const capability = { enabled: true, method: 'ach', payerEntityId: invoice.payerEntityId };
const instruction = (payerApproval, providerCapability = capability) => createB2BPaymentInstruction({ invoice, method: 'ach', payerApproval, providerCapability });

test('payment approval cannot be replayed for another invoice, entity, amount or currency', () => {
  for (const patch of [
    { invoiceId: 'inv-other' },
    { payerEntityId: 'payer-b' },
    { amountCents: 12524 },
    { currency: 'EUR' },
    { approved: false },
    { actorId: '' },
    { approvedAt: '' },
  ]) assert.throws(() => instruction({ ...approval, ...patch }));
});

test('provider capability is payer- and rail-specific and never enables direct execution', () => {
  assert.throws(() => instruction(approval, { ...capability, payerEntityId: 'payer-b' }));
  assert.throws(() => instruction(approval, { ...capability, method: 'wire' }));
  const staged = instruction(approval);
  assert.equal(staged.providerExecutionPermitted, false);
  assert.equal(staged.state, 'approved_not_submitted');
  assert.equal(staged.settled, false);
  assert.equal(staged.reconciled, false);
});

test('untrusted provider evidence cannot mark an invoice paid or reconciled', () => {
  const forged = {
    invoiceId: invoice.id, payerEntityId: invoice.payerEntityId,
    payeeEntityId: invoice.payeeEntityId, amountCents: 12525,
    currency: 'USD', status: 'settled', providerTransactionId: 'forged-123'
  };
  const result = projectB2BInvoiceStatus({
    invoice, bankConfirmation: forged,
    reconciliation: { invoiceId: invoice.id, providerTransactionId: 'forged-123', matched: true }
  });
  assert.equal(result.settled, false);
  assert.equal(result.reconciled, false);
  assert.equal(result.receivableOutstandingCents, 12525);
});
