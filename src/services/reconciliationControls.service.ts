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

// Date.parse may normalize impossible calendar dates (for example February 30).
// Controller signoff evidence must preserve a real calendar instant and a
// valid timezone offset; this is completeness validation, not authentication.
function hasValidControllerSignoffTimestamp(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysPerMonth[month - 1] ||
      hour > 23 || minute > 59 || second > 59) return false;
  if (zone !== 'Z') {
    const offsetHour = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false;
  }
  return Number.isFinite(Date.parse(value));
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

  // Unknown or missing approval states must not be treated as pending review.
  // Legacy records without an explicit approval state require re-review rather
  // than silently becoming eligible for controller approval or close.
  if (reconciliation.closeApprovalStatus !== 'pending' && reconciliation.closeApprovalStatus !== 'approved') {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Reconciliation close requires an explicit pending or approved controller state.',
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
      !hasValidControllerSignoffTimestamp(reconciliation.controllerSignoffAt)
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
