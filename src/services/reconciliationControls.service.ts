import type { BankAccountRecord, ReconciliationRecord } from '../types/core';

export interface ReconciliationCloseMetrics {
  bookEndingBalance: number;
  differenceAmount: number;
  unresolvedLineCount: number;
  matchedLineCount: number;
  isReadyToApprove: boolean;
  blockedReason?: string;
}

export function buildReconciliationCloseMetrics(
  reconciliation: ReconciliationRecord,
  bankAccount?: BankAccountRecord
): ReconciliationCloseMetrics {
  const bookEndingBalance = bankAccount?.currentBalance ?? 0;
  const differenceAmount = Number(
    (reconciliation.statementEndingBalance - bookEndingBalance).toFixed(2)
  );
  // Suggested matches are not controller-approved matches. Treat both explicit
  // unmatched IDs and unresolved parsed lines as blockers; either source can
  // be stale independently after an interrupted statement review.
  const parsedLines = reconciliation.parsedStatementLines ?? [];
  // Duplicate or blank statement-line IDs can make a duplicated import look
  // fully matched. Fail closed rather than approving ambiguous source rows.
  const parsedLineIds = new Set<string>();
  const hasInvalidLineIds = parsedLines.some((line) => {
    const id = line?.id;
    if (typeof id !== 'string' || !id.trim() || parsedLineIds.has(id)) return true;
    parsedLineIds.add(id);
    return false;
  });
  // The explicit matched-ID index is optional for legacy records, but when
  // present it must agree with the parsed source rows. A stale/orphaned index
  // must not silently certify a statement whose review data has diverged.
  const matchedIdList = reconciliation.matchedStatementLineIds;
  const matchedIdSet = new Set(matchedIdList ?? []);
  const hasInconsistentMatchedIds = matchedIdList !== undefined && (
    !Array.isArray(matchedIdList) ||
    matchedIdSet.size !== matchedIdList.length ||
    matchedIdList.some((id) => typeof id !== 'string' || !id.trim() || !parsedLineIds.has(id)) ||
    parsedLines.some((line) => matchedIdSet.has(line.id) !== (line.matchStatus === 'matched'))
  );
  const unresolvedLineIds = new Set(reconciliation.unmatchedStatementLineIds ?? []);
  for (const line of parsedLines) {
    if (line.matchStatus !== 'matched') {
      unresolvedLineIds.add(line.id);
    }
  }
  const unresolvedLineCount = unresolvedLineIds.size;
  const matchedLineCount = parsedLines.length
    ? parsedLines.filter((line) =>
        line.matchStatus === 'matched' && !unresolvedLineIds.has(line.id)
      ).length
    : reconciliation.matchedStatementLineIds?.length ?? 0;

  if (
    !bankAccount ||
    bankAccount.id !== reconciliation.bankAccountId ||
    bankAccount.entityId !== reconciliation.entityId ||
    !Number.isFinite(bankAccount.currentBalance)
  ) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'A matching bank account with a valid book balance is required.',
    };
  }

  if (!Number.isFinite(reconciliation.statementEndingBalance)) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'A valid statement ending balance is required.',
    };
  }

  if (!parsedLines.length) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Statement lines must be imported and reviewed before automatic approval.',
    };
  }

  if (hasInvalidLineIds) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Statement lines must have unique, nonempty identifiers.',
    };
  }

  if (hasInconsistentMatchedIds) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Matched statement-line identifiers must agree with reviewed source rows.',
    };
  }

  if (!reconciliation.statementImportId && !reconciliation.statementFileName) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Import a statement before approving close.',
    };
  }

  // Only an explicitly completed review can be considered for automatic
  // close eligibility. Missing, pending, and already-completed reviews must
  // never be inferred as ready merely because balances happen to match.
  if (reconciliation.statementReviewStatus !== 'ready_to_close') {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Statement review must be explicitly ready to close.',
    };
  }

  if (unresolvedLineCount > 0) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Resolve or explicitly override remaining statement exceptions before close.',
    };
  }

  if (Math.abs(differenceAmount) > 0.01) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Statement ending balance does not tie to the current book balance snapshot.',
    };
  }

  return {
    bookEndingBalance,
    differenceAmount,
    unresolvedLineCount,
    matchedLineCount,
    isReadyToApprove: true,
  };
}
