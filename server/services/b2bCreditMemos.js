// Credit memos represent approved reductions in receivables, never money movement.
const ID = /^[A-Za-z0-9_-]{1,120}$/;
export function validateCreditMemo(invoice, input) {
  if (!invoice || !ID.test(String(invoice.id || ''))) throw new Error('Valid invoice required.');
  if (!input || typeof input.id !== 'string' || !ID.test(input.id)) throw new Error('Valid credit memo ID required.');
  if (typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.length > 2000) throw new Error('Credit memo reason required.');
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 ||
      input.amountCents > invoice.amountCents) throw new Error('Credit amount exceeds invoice or is invalid.');
  return Object.freeze({ id: input.id, invoiceId: invoice.id, payeeEntityId: invoice.payeeEntityId,
    payerEntityId: invoice.payerEntityId, currency: invoice.currency, amountCents: input.amountCents,
    reason: input.reason.trim(), state: 'credit_memo_issued', settled: false });
}
