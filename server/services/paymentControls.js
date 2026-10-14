// Provider-neutral, fail-closed payment lifecycle. A request is not proof of settlement.
const finalStatuses = new Set(['settled', 'failed', 'rejected', 'cancelled']);
export function classifyPaymentStatus(approvalRequest, transactions = []) {
  const raw = String(approvalRequest?.status || '').toLowerCase();
  const transactionList = Array.isArray(transactions) ? transactions : [];
  const requestId = String(approvalRequest?.id || '');
  const matching = transactionList.filter(tx => requestId && String(tx?.requestId || '') === requestId);
  const completed = matching.find(tx => ['sent', 'completed', 'settled'].includes(String(tx?.status || '').toLowerCase()));
  const returned = matching.find(tx => ['failed', 'rejected', 'returned', 'cancelled'].includes(String(tx?.status || '').toLowerCase()));
  if (returned) return { state: 'failed', reconciled: false, transactionId: returned.id || null };
  if (completed) return { state: 'bank_confirmed', reconciled: false, transactionId: completed.id || null };
  if (['rejected', 'failed', 'cancelled', 'denied'].includes(raw)) return { state: 'failed', reconciled: false, transactionId: null };
  if (['approved', 'processing', 'pending', 'sent', 'completed'].includes(raw)) return { state: 'processing', reconciled: false, transactionId: null };
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
