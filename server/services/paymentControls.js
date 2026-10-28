// Provider-neutral, fail-closed payment lifecycle. A request is not proof of settlement.
const FAILURE_STATES = new Set(['failed', 'rejected', 'returned', 'cancelled', 'reversed', 'blocked']);
const CONFIRMED_STATES = new Set(['completed', 'settled', 'posted']);
const statusOf = tx => String(tx?.status || '').toLowerCase();

// A failure wins over earlier progress, independent of provider array ordering.
export function selectPaymentTransaction(requestId, transactions = []) {
  if (!requestId || !Array.isArray(transactions)) return null;
  const matching = transactions.filter(tx => tx?.id && String(tx.requestId || '') === String(requestId));
  return matching.find(tx => FAILURE_STATES.has(statusOf(tx))) ||
    matching.find(tx => !CONFIRMED_STATES.has(statusOf(tx))) || matching[0] || null;
}
export function classifyPaymentStatus(approvalRequest, transactions = []) {
  const raw = String(approvalRequest?.status || '').toLowerCase();
  const transaction = selectPaymentTransaction(approvalRequest?.id, transactions);
  if (transaction && FAILURE_STATES.has(statusOf(transaction))) return { state: 'failed', reconciled: false, transactionId: transaction.id };
  if (FAILURE_STATES.has(raw) || raw === 'denied') return { state: 'failed', reconciled: false, transactionId: null };
  if (transaction && CONFIRMED_STATES.has(statusOf(transaction))) return { state: 'bank_confirmed', reconciled: false, transactionId: transaction.id };
  if (transaction || ['approved', 'processing', 'pending', 'sent', 'completed'].includes(raw)) return { state: 'processing', reconciled: false, transactionId: null };
  return { state: 'approval_pending', reconciled: false, transactionId: null };
}
export function reconcileBankTransaction({ bankTransaction, ledgerEntry, expectedAccountId }) {
  if (!expectedAccountId || !bankTransaction || !ledgerEntry) return { matched: false, reason: 'missing_evidence' };
  if (String(bankTransaction.accountId || '') !== String(expectedAccountId)) return { matched: false, reason: 'account_mismatch' };
  if (String(ledgerEntry.accountId || '') !== String(expectedAccountId)) return { matched: false, reason: 'ledger_account_mismatch' };
  if (!bankTransaction.id || !ledgerEntry.id) return { matched: false, reason: 'missing_identifier' };
  if (String(ledgerEntry.bankTransactionId || '') !== String(bankTransaction.id)) return { matched: false, reason: 'unlinked_transaction' };
  const amount = Number(bankTransaction.amount);
  const posted = Number(ledgerEntry.amount);
  if (!Number.isFinite(amount) || !Number.isFinite(posted) || Math.round(amount * 100) !== Math.round(posted * 100)) return { matched: false, reason: 'amount_mismatch' };
  if (!['posted', 'settled', 'completed'].includes(String(bankTransaction.status || '').toLowerCase())) return { matched: false, reason: 'bank_not_posted' };
  return { matched: true, reason: null, bankTransactionId: bankTransaction.id, ledgerEntryId: ledgerEntry.id };
}
