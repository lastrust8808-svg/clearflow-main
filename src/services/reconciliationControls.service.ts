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

// A filename-only legacy import is still allowed, but blank, padded, or
// control-character provenance must never certify an automatic close.
// This is record-shape validation, not proof that a statement was imported.
function isValidStatementSourceRef(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

// Imported statement rows must carry complete financial evidence before their
// matched status can contribute to approval. A valid line ID alone is not
// evidence of a valid posted transaction.
function hasValidStatementCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysPerMonth[month - 1];
}

function hasValidStatementFinancialFields(
  line: NonNullable<ReconciliationRecord['parsedStatementLines']>[number]
): boolean {
  const amountCents = toSafeCents(line.amount);
  return amountCents !== null &&
    amountCents !== 0 &&
    (line.direction === 'credit' || line.direction === 'debit') &&
    hasValidStatementCalendarDate(line.postedDate) &&
    isValidStatementSourceRef(line.description);
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
  const rawParsedLines = reconciliation.parsedStatementLines;
  // Imported rows are untrusted persisted input. A malformed collection or
  // null/non-object row must block approval, not throw during index matching.
  // Missing rows remain subject to the existing no-statement-lines gate.
  if (rawParsedLines != null && (
    !Array.isArray(rawParsedLines) ||
    rawParsedLines.some((line) => !line || typeof line !== 'object' || Array.isArray(line))
  )) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount: 0,
      matchedLineCount: 0,
      isReadyToApprove: false,
      blockedReason: 'Parsed statement lines must be a valid array of source rows.',
    };
  }
  const parsedLines = rawParsedLines ?? [];
  // Duplicate or blank statement-line IDs can make a duplicated import look
  // fully matched. Fail closed rather than approving ambiguous source rows.
  const parsedLineIds = new Set<string>();
  const hasInvalidLineIds = parsedLines.some((line) => {
    const id = line?.id;
    if (!isValidStatementSourceRef(id) || parsedLineIds.has(id)) return true;
    parsedLineIds.add(id);
    return false;
  });
  // Both review indices must be explicit before a statement can qualify
  // for approval. Missing legacy indices are not evidence of completed review:
  // a parsed row marked "matched" is not independently verified by itself.
  // An explicit empty unmatched list is valid after review.
  const matchedIdList = reconciliation.matchedStatementLineIds;
  const matchedIdSet = new Set<string>(Array.isArray(matchedIdList) ? matchedIdList : []);
  const hasInconsistentMatchedIds = !Array.isArray(matchedIdList) ||
    matchedIdSet.size !== matchedIdList.length ||
    matchedIdList.some((id) => !isValidStatementSourceRef(id) || !parsedLineIds.has(id)) ||
    parsedLines.some((line) => matchedIdSet.has(line.id) !== (line.matchStatus === 'matched'));
  // A missing, malformed or duplicated unmatched index must not masquerade
  // as an explicitly reviewed zero-exception statement.
  const unmatchedIdList = reconciliation.unmatchedStatementLineIds;
  const hasInvalidUnmatchedIds = !Array.isArray(unmatchedIdList) ||
    unmatchedIdList.some((id) => !isValidStatementSourceRef(id)) ||
    new Set(unmatchedIdList).size !== unmatchedIdList.length;
  const unresolvedLineIds = new Set<string>(Array.isArray(unmatchedIdList) ? unmatchedIdList : []);
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

  // Equality alone cannot establish a scoped reconciliation identity: a
  // missing bankAccountId and a missing account.id (or two padded IDs) can
  // compare equal and otherwise authorize a balance-matched close. Require
  // canonical identifiers on both sides before evaluating account equality.
  // This is input integrity, not authenticated tenant authorization.
  if (
    !isValidStatementSourceRef(reconciliation.id) ||
    !isValidStatementSourceRef(reconciliation.entityId) ||
    !isValidStatementSourceRef(reconciliation.bankAccountId) ||
    (bankAccount != null && (
      !isValidStatementSourceRef(bankAccount.id) ||
      !isValidStatementSourceRef(bankAccount.entityId)
    ))
  ) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Reconciliation and bank account must have valid scoped identifiers.',
    };
  }

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

  // Reject malformed imported amounts, directions, dates and descriptions
  // even if all line IDs and balances tie. Do not treat a fabricated matched
  // marker as sufficient source-row evidence.
  if (parsedLines.some((line) => !hasValidStatementFinancialFields(line))) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Imported statement rows require valid date, description, direction and exact-cent nonzero amount.',
    };
  }

  // Reconciliation periods and imported posting dates must be real calendar
  // dates and refer to the same closed statement window. Otherwise an
  // out-of-period matched row can certify an unrelated balance snapshot.
  // This validates evidence consistency; it does not prove bank ownership.
  if (
    !hasValidStatementCalendarDate(reconciliation.periodStart) ||
    !hasValidStatementCalendarDate(reconciliation.periodEnd) ||
    reconciliation.periodStart > reconciliation.periodEnd ||
    parsedLines.some((line) =>
      !hasValidStatementCalendarDate(line.postedDate) ||
      line.postedDate < reconciliation.periodStart ||
      line.postedDate > reconciliation.periodEnd
    )
  ) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Statement period and imported posting dates must be valid and within the same period.',
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

  if (hasInvalidUnmatchedIds) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Unmatched statement-line identifiers must be a valid list of source row IDs.',
    };
  }

  // A balanced statement is not sufficient when the book-side transaction
  // review still contains unresolved items. Validate both indices explicitly:
  // malformed or duplicated cleared IDs can conceal a replayed posting, and
  // unresolved book transactions cannot be silently ignored at close.
  // Missing unmatched-book index is NOT evidence of zero exceptions: legacy
  // records must undergo explicit book-side review before approval.
  const clearedIds = reconciliation.clearedTransactionIds;
  const unmatchedBookIds = reconciliation.unmatchedTransactionIds;
  const validUniqueIds = (ids: unknown): ids is string[] =>
    Array.isArray(ids) &&
    ids.every((id) => isValidStatementSourceRef(id)) &&
    new Set(ids).size === ids.length;
  if (
    !validUniqueIds(clearedIds) ||
    !validUniqueIds(unmatchedBookIds) ||
    (Array.isArray(clearedIds) && Array.isArray(unmatchedBookIds) &&
      unmatchedBookIds.some((id) => clearedIds.includes(id)))
  ) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Cleared and unmatched book transaction identifiers must be valid, unique and disjoint.',
    };
  }
  // A statement line cannot be considered matched to the books when the
  // explicitly reviewed cleared-book index contains no transactions. This
  // guards against a stale/fabricated matched flag with no corresponding
  // book-side review. It does not prove that individual IDs truly match;
  // server-side ledger linkage and authenticated approval are still required.
  if (matchedLineCount > 0 && clearedIds.length === 0) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Matched statement rows require at least one reviewed cleared book transaction.',
    };
  }

  if (unmatchedBookIds?.length) {
    return {
      bookEndingBalance,
      differenceAmount,
      unresolvedLineCount,
      matchedLineCount,
      isReadyToApprove: false,
      blockedReason: 'Unresolved book transactions must be reviewed before reconciliation close.',
    };
  }

  if (
    (reconciliation.statementImportId != null && !isValidStatementSourceRef(reconciliation.statementImportId)) ||
    (reconciliation.statementFileName != null && !isValidStatementSourceRef(reconciliation.statementFileName)) ||
    (!isValidStatementSourceRef(reconciliation.statementImportId) &&
      !isValidStatementSourceRef(reconciliation.statementFileName))
  ) {
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
