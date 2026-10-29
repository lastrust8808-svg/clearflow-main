import type { BankAccountRecord, ReconciliationRecord } from '../types/core';

export interface ReconciliationCloseMetrics {
  bookEndingBalance: number;
  differenceAmount: number;
  unresolvedLineCount: number;
  matchedLineCount: number;
  isReadyToApprove: boolean;
  blockedReason?: string;
}

// Automatic close requires exact minor-unit balances. Checking only whether
// amount * 100 is near an integer silently accepts tiny fractional cents.
// Validate the decimal representation first; then round only IEEE-754
// multiplication noise from an already valid two-decimal input.
function toSafeCents(amount: number): number | null {
  if (!Number.isFinite(amount) || !/^-?\d+(?:\.\d{1,2})?$/.test(String(amount))) {
    return null;
  }
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function buildReconciliationCloseMetrics(
  reconciliation: ReconciliationRecord,
  bankAccount?: BankAccountRecord
): ReconciliationCloseMetrics {
  const bookEndingBalance = bankAccount?.currentBalance ?? 0;
  const bookCents = toSafeCents(bookEndingBalance);
  const statementCents = toSafeCents(reconciliation.statementEndingBalance);
  const differenceAmount = bookCents === null || statementCents === null
    ? Number.NaN
    : (statementCents - bookCents) / 100;
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
    !Number.isFinite(bankAccount.currentBalance) ||
    bookCents === null
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

  if (statementCents === null) {
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
  // A previously closed reconciliation or an already-submitted close job must
  // never regain approval eligibility from stale imported statement data.
  // The approved-but-not-yet-closed state remains eligible for the existing
  // controller-approved close workflow.
  if (
    (reconciliation.status !== 'open' && reconciliation.status !== 'in_review') ||
    reconciliation.closeApprovalStatus === 'closed' ||
    Boolean(reconciliation.closedAt) ||
    Boolean(reconciliation.closeJobId)
  ) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'A completed reconciliation cannot be approved again.',
    };
  }

  // An approved close must retain explicit controller signoff evidence. An
  // approval flag without a named controller and timestamp can be replayed
  // from a partial/stale client record; it must not qualify as close-ready.
  // This checks record completeness only; server-side authorization and
  // immutable approval audit remain mandatory before any actual close.
  if (
    reconciliation.closeApprovalStatus === 'approved' && (
      typeof reconciliation.controllerSignoffName !== 'string' ||
      !reconciliation.controllerSignoffName.trim() ||
      typeof reconciliation.controllerSignoffAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(reconciliation.controllerSignoffAt) ||
      !Number.isFinite(Date.parse(reconciliation.controllerSignoffAt))
    )
  ) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Controller-approved close requires a named controller and valid signoff timestamp.',
    };
  }

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

  if (statementCents !== bookCents) {
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
