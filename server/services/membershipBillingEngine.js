// Membership billing domain logic. No provider transfers are initiated here.
// Persist invoices and both journal entries in ONE database transaction, keyed by invoice.id.
const cents = value => Number.isSafeInteger(value) && value > 0;
const pad = n => String(n).padStart(2, '0');
export function billingDateForMonth(year, month, billingDay) {
  if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31) throw new Error('Invalid billing calendar');
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(last, billingDay))}`;
}
export function generateMonthlyMembershipCharge({memberId, planId, amountCents, currency='USD', year, month, billingDay, status='active', creditCents=0}) {
  if (!memberId || !planId || !cents(amountCents) || !Number.isSafeInteger(creditCents) ||
      creditCents < 0 || creditCents > amountCents || !/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid membership charge');
  if (status !== 'active') return null;
  const dueDate = billingDateForMonth(year, month, billingDay);
  const chargeCents = amountCents - creditCents;
  const id = `membership:${encodeURIComponent(memberId)}:${year}-${pad(month)}`;
  return {id, memberId, planId, dueDate, currency, amountCents:chargeCents,
    originalAmountCents:amountCents, creditCents, state:chargeCents ? 'due' : 'covered_by_credit'};
}
export function pairedMembershipAccrual(invoice, {memberEntityId, clearflowEntityId}) {
  if (!invoice?.id || !memberEntityId || !clearflowEntityId || memberEntityId===clearflowEntityId ||
      !Number.isSafeInteger(invoice.amountCents) || invoice.amountCents < 0) throw new Error('Invalid ledger posting');
  const amount = invoice.amountCents;
  if (!amount) return [];
  return [
    {id:`${invoice.id}:member:expense`, invoiceId:invoice.id, entityId:memberEntityId, account:'membership_expense', debitCents:amount, creditCents:0},
    {id:`${invoice.id}:member:payable`, invoiceId:invoice.id, entityId:memberEntityId, account:'membership_payable', debitCents:0, creditCents:amount},
    {id:`${invoice.id}:clearflow:receivable`, invoiceId:invoice.id, entityId:clearflowEntityId, account:'membership_receivable', debitCents:amount, creditCents:0},
    {id:`${invoice.id}:clearflow:revenue`, invoiceId:invoice.id, entityId:clearflowEntityId, account:'membership_revenue', debitCents:0, creditCents:amount},
  ];
}
export function authorizedAchCollection(invoice, authorization, today) {
  if (!invoice?.id || !invoice.amountCents || !authorization?.enabled ||
      authorization.memberId !== invoice.memberId ||
      authorization.currency !== invoice.currency ||
      authorization.maxAmountCents < invoice.amountCents ||
      !authorization.mandateReference || !authorization.providerPaymentMethodRef ||
      !authorization.acceptedAt || !authorization.authorizationVersion ||
      authorization.revokedAt || authorization.expiresAt && today > authorization.expiresAt ||
      today !== invoice.dueDate) return {eligible:false, reason:'authorization_or_due_date_missing'};
  return {eligible:true, invoiceId:invoice.id, amountCents:invoice.amountCents,
    currency:invoice.currency, providerPaymentMethodRef:authorization.providerPaymentMethodRef,
    mandateReference:authorization.mandateReference,
    idempotencyKey:`ach:${invoice.id}`, state:'awaiting_provider_adapter'};
}
// Payment state changes require authenticated provider evidence, not scheduler success.
// A provider adapter must separately enforce ACH authorization, cutoffs, returns, and retries.
export function paymentSettlementPostings(invoice, providerEvidence, {memberEntityId,clearflowEntityId}) {
  if (!providerEvidence?.verified || providerEvidence.invoiceId !== invoice?.id ||
      providerEvidence.amountCents !== invoice.amountCents ||
      providerEvidence.currency !== invoice.currency ||
      !providerEvidence.providerTransactionId || providerEvidence.status !== 'settled') {
    throw new Error('Verified matching settlement required');
  }
  const amount=invoice.amountCents;
  const id=`${invoice.id}:settlement:${providerEvidence.providerTransactionId}`;
  return [
    {id:`${id}:member:payable`,entityId:memberEntityId,account:'membership_payable',debitCents:amount,creditCents:0},
    {id:`${id}:member:bank`,entityId:memberEntityId,account:'bank',debitCents:0,creditCents:amount},
    {id:`${id}:clearflow:bank`,entityId:clearflowEntityId,account:'bank',debitCents:amount,creditCents:0},
    {id:`${id}:clearflow:receivable`,entityId:clearflowEntityId,account:'membership_receivable',debitCents:0,creditCents:amount},
  ];
}
