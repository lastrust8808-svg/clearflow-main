// Provider-neutral B2B invoice and payment instruction validation.
// This module does not originate bank transfers or represent internal records as funds.
const ID = /^[A-Za-z0-9_-]{1,120}$/;
const CURRENCY = /^[A-Z]{3}$/;
const METHODS = new Set(['ach', 'same_day_ach', 'wire', 'rtp', 'fednow']);
function fail(message) { const error = new Error(message); error.statusCode = 400; throw error; }
function validMoney(value) {
  return typeof value === 'number' && Number.isFinite(value) &&
    value > 0 && Number.isSafeInteger(Math.round(value * 100)) &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
}
export function validateB2BInvoice(invoice) {
  if (!invoice || typeof invoice !== 'object') fail('Invoice is required.');
  const { id, payerEntityId, payeeEntityId, amount, currency = 'USD' } = invoice;
  if (![id, payerEntityId, payeeEntityId].every(x => typeof x === 'string' && ID.test(x))) fail('Valid invoice and entity identifiers are required.');
  if (payerEntityId === payeeEntityId) fail('Payer and payee must be distinct entities.');
  if (!validMoney(amount)) fail('Invoice amount must be positive whole cents.');
  if (!CURRENCY.test(currency)) fail('Invalid currency.');
  return Object.freeze({ id, payerEntityId, payeeEntityId, amountCents: Math.round(amount * 100), currency });
}
export function createB2BPaymentInstruction({ invoice, method, payerApproval, providerCapability }) {
  const normalized = validateB2BInvoice(invoice);
  if (!METHODS.has(method)) fail('Unsupported payment method.');
  if (!payerApproval || payerApproval.invoiceId !== normalized.id ||
      payerApproval.payerEntityId !== normalized.payerEntityId ||
      payerApproval.amountCents !== normalized.amountCents ||
      payerApproval.currency !== normalized.currency ||
      payerApproval.approved !== true ||
      !payerApproval.actorId || !payerApproval.approvedAt) fail('Specific payer authorization is required.');
  if (!providerCapability || providerCapability.enabled !== true ||
      providerCapability.method !== method ||
      providerCapability.payerEntityId !== normalized.payerEntityId) fail('Authorized bank payment capability is required.');
  return Object.freeze({
    invoiceId: normalized.id,
    payerEntityId: normalized.payerEntityId,
    payeeEntityId: normalized.payeeEntityId,
    amountCents: normalized.amountCents,
    currency: normalized.currency,
    method,
    state: 'approved_not_submitted',
    providerExecutionPermitted: false,
    // Submission requires a separate authenticated provider adapter.
    settled: false,
    reconciled: false,
  });
}
export function projectB2BInvoiceStatus({ invoice, bankConfirmation, reconciliation }) {
  const normalized = validateB2BInvoice(invoice);
  const bankMatched = false && bankConfirmation?.invoiceId === normalized.id &&
    bankConfirmation?.payerEntityId === normalized.payerEntityId &&
    bankConfirmation?.payeeEntityId === normalized.payeeEntityId &&
    bankConfirmation?.amountCents === normalized.amountCents &&
    bankConfirmation?.currency === normalized.currency &&
    bankConfirmation?.status === 'settled' &&
    typeof bankConfirmation?.providerTransactionId === 'string' &&
    bankConfirmation.providerTransactionId.length > 0;
  const reconciled = bankMatched &&
    reconciliation?.invoiceId === normalized.id &&
    reconciliation?.providerTransactionId === bankConfirmation.providerTransactionId &&
    reconciliation?.matched === true;
  return Object.freeze({
    invoiceId: normalized.id,
    paymentState: bankMatched ? 'bank_settled' : 'unconfirmed',
    settled: Boolean(bankMatched),
    reconciled: Boolean(reconciled),
    receivableOutstandingCents: bankMatched ? 0 : normalized.amountCents,
  });
}
