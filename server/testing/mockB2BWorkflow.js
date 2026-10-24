// Offline invoice-to-settlement simulation. Never submits provider instructions.
import { validateB2BInvoice, createB2BPaymentInstruction, projectB2BInvoiceStatus } from '../services/b2bPayments.js';
import { createMockLedger } from './mockTransactionLedger.js';

export function createMockB2BWorkflow(openingBalances) {
  const ledger = createMockLedger(openingBalances);
  const invoices = new Map();
  const approvals = new Map();
  const outcomes = new Map();
  return {
    createInvoice(raw) {
      const invoice = validateB2BInvoice(raw);
      if (invoices.has(invoice.id)) throw new Error('Duplicate invoice');
      invoices.set(invoice.id, invoice);
      return invoice;
    },
    approve(invoiceId, actorId, method = 'ach') {
      const invoice = invoices.get(invoiceId);
      if (!invoice) throw new Error('Invoice not found');
      if (!actorId) throw new Error('Approver required');
      const approval = { invoiceId, payerEntityId: invoice.payerEntityId,
        amountCents: invoice.amountCents, currency: invoice.currency,
        approved: true, actorId, approvedAt: '2026-01-01T00:00:00.000Z' };
      const instruction = createB2BPaymentInstruction({
        invoice: { ...invoice, amount: invoice.amountCents / 100 },
        method, payerApproval: approval,
        providerCapability: { enabled: true, method, payerEntityId: invoice.payerEntityId },
      });
      approvals.set(invoiceId, approval);
      return instruction;
    },
    settle(invoiceId, outcome = 'settled') {
      const invoice = invoices.get(invoiceId);
      if (!invoice || !approvals.has(invoiceId)) throw new Error('Payer approval required');
      const event = ledger.post({ id: 'invoice_' + invoiceId,
        from: invoice.payerEntityId, to: invoice.payeeEntityId,
        amountCents: invoice.amountCents, currency: invoice.currency, outcome });
      outcomes.set(invoiceId, event);
      return event;
    },
    status(invoiceId) {
      const invoice = invoices.get(invoiceId);
      if (!invoice) throw new Error('Invoice not found');
      // Production status intentionally cannot accept mock bank confirmations.
      return projectB2BInvoiceStatus({
        invoice: { ...invoice, amount: invoice.amountCents / 100 },
      });
    },
    mockStatus(invoiceId) {
      const event = outcomes.get(invoiceId);
      return { invoiceId, simulated: true,
        paymentState: event?.status || 'unsubmitted',
        settled: event?.status === 'settled',
        reconciled: event?.status === 'settled' && ledger.reconcile().balanced };
    },
    ledger,
  };
}
