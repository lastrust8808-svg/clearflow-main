import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReconciliationCloseMetrics } from '../src/services/reconciliationControls.service.ts';

const account = {
  id: 'bank-a',
  entityId: 'entity-a',
  currentBalance: 100,
};

function statementLine(id, matchStatus, overrides = {}) {
  return {
    id,
    postedDate: '2026-10-28',
    description: 'Imported bank transaction',
    amount: 25.75,
    direction: 'debit',
    matchStatus,
    ...overrides,
  };
}

function reconciliation(overrides = {}) {
  return {
    id: 'reconciliation-a',
    entityId: 'entity-a',
    bankAccountId: 'bank-a',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    statementEndingBalance: 100,
    clearedTransactionIds: ['ledger-1'],
    unmatchedTransactionIds: [],
    statementImportId: 'import-a',
    statementImportedAt: '2026-10-27T12:00:00Z',
    statementReviewStatus: 'ready_to_close',
    status: 'in_review',
    closeApprovalStatus: 'pending',
    matchedStatementLineIds: ['line-1'],
    unmatchedStatementLineIds: [],
    parsedStatementLines: [statementLine('line-1', 'matched')],
    ...overrides,
  };
}

test('fully reviewed statement with a matching bank balance is eligible for controller approval', () => {
  const metrics = buildReconciliationCloseMetrics(reconciliation(), account);
  assert.equal(metrics.isReadyToApprove, true);
  assert.equal(metrics.matchedLineCount, 1);
  assert.equal(metrics.unresolvedLineCount, 0);
});

for (const status of ['suggested', 'exception', 'unreviewed']) {
  test(`${status} lines cannot be treated as approved when unmatched ID list is stale`, () => {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({
        parsedStatementLines: [statementLine('line-1', status)],
        matchedStatementLineIds: ['line-1'],
        unmatchedStatementLineIds: [],
      }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false);
    assert.equal(metrics.unresolvedLineCount, 1);
    assert.equal(metrics.matchedLineCount, 0);
  });
}

test('explicit unresolved IDs block approval even if parsed status says matched', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ unmatchedStatementLineIds: ['line-1', 'orphan-line'] }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
  assert.equal(metrics.unresolvedLineCount, 2);
});

test('missing or mismatched bank account cannot silently supply a zero book balance', () => {
  for (const candidate of [
    undefined,
    { ...account, id: 'bank-other' },
    { ...account, entityId: 'entity-other' },
    { ...account, currentBalance: undefined },
    { ...account, currentBalance: Number.NaN },
  ]) {
    const metrics = buildReconciliationCloseMetrics(reconciliation(), candidate);
    assert.equal(metrics.isReadyToApprove, false);
    assert.match(metrics.blockedReason, /matching bank account/);
  }
});

test('statement with no parsed lines cannot automatically close even if balance ties', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ parsedStatementLines: [], matchedStatementLineIds: [] }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
  assert.match(metrics.blockedReason, /Statement lines/);
});

test('invalid statement balance blocks approval', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ statementEndingBalance: Number.NaN }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
});

for (const reviewStatus of ['not_imported', 'needs_review', 'completed', undefined]) {
  test(`statement review status ${String(reviewStatus)} cannot qualify for automatic close`, () => {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ statementReviewStatus: reviewStatus }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false);
    assert.equal(metrics.differenceAmount, 0);
    assert.equal(metrics.unresolvedLineCount, 0);
    assert.match(metrics.blockedReason, /explicitly ready to close/);
  });
}

test('book and statement differences still block automatic approval', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ statementEndingBalance: 100.03 }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
});


test('duplicate matched statement line IDs cannot approve a double-counted import', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({
      parsedStatementLines: [
        statementLine('line-1', 'matched'),
        statementLine('line-1', 'matched'),
      ],
    }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
  assert.match(metrics.blockedReason, /unique, nonempty identifiers/);
});

test('blank or missing statement line identifiers cannot be approved', () => {
  for (const id of ['', '  ', undefined]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ parsedStatementLines: [{ id, matchStatus: 'matched' }] }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false);
    assert.match(metrics.blockedReason, /unique, nonempty identifiers/);
  }
});

test('orphan matched IDs cannot certify a statement when parsed rows are different', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ matchedStatementLineIds: ['line-1', 'not-in-statement'] }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
  assert.match(metrics.blockedReason, /must agree with reviewed source rows/);
});

test('stale matched index cannot certify a parsed matched row', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ matchedStatementLineIds: [] }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
  assert.match(metrics.blockedReason, /must agree with reviewed source rows/);
});

test('matched index cannot include a source row still awaiting review', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({
      parsedStatementLines: [
        statementLine('line-1', 'matched'),
        statementLine('line-2', 'suggested'),
      ],
      matchedStatementLineIds: ['line-1', 'line-2'],
    }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
  assert.match(metrics.blockedReason, /must agree with reviewed source rows/);
});

test('duplicate matched-index entries are rejected even if parsed rows are unique', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ matchedStatementLineIds: ['line-1', 'line-1'] }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
  assert.match(metrics.blockedReason, /must agree with reviewed source rows/);
});

test('legacy parsed statements missing matched-index evidence require re-review', () => {
  for (const matchedStatementLineIds of [undefined, null, 'line-1', {}]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ matchedStatementLineIds }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, String(matchedStatementLineIds));
    assert.match(metrics.blockedReason, /must agree with reviewed source rows/);
  }
});

test('missing unmatched statement index cannot be mistaken for zero exceptions', () => {
  for (const unmatchedStatementLineIds of [undefined, null]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ unmatchedStatementLineIds }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, String(unmatchedStatementLineIds));
    assert.match(metrics.blockedReason, /Unmatched statement-line identifiers/);
  }
});

test('duplicate unmatched statement IDs are rejected as invalid review evidence', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({
      parsedStatementLines: [
        statementLine('line-1', 'matched'),
        statementLine('line-2', 'exception'),
      ],
      unmatchedStatementLineIds: ['line-2', 'line-2'],
    }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
  assert.match(metrics.blockedReason, /Unmatched statement-line identifiers/);
});


test('closed reconciliation cannot regain approval eligibility from stale ready-to-close data', () => {
  for (const overrides of [
    { status: 'completed' },
    { status: undefined },
    { status: 'unexpected' },
    { closeApprovalStatus: 'closed' },
    { closedAt: '2026-10-28T18:00:00Z' },
    { closeJobId: 'already-submitted-job' },
  ]) {
    const metrics = buildReconciliationCloseMetrics(reconciliation(overrides), account);
    assert.equal(metrics.isReadyToApprove, false, JSON.stringify(overrides));
    assert.match(metrics.blockedReason, /completed reconciliation cannot be approved again/);
  }
});

test('controller-approved but still open reconciliation retains close eligibility', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ closeApprovalStatus: 'approved', controllerSignoffName: 'Controller A', controllerSignoffAt: '2026-10-28T18:00:00Z' }),
    account
  );
  assert.equal(metrics.isReadyToApprove, true);
});


test('one-cent and sub-cent differences cannot silently qualify for reconciliation close', () => {
  for (const statementEndingBalance of [100.01, 99.99, 100.004, 99.996]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ statementEndingBalance }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, String(statementEndingBalance));
    assert.match(metrics.blockedReason, /balance|valid statement/i);
  }
});

test('fractional-cent book or statement balances are rejected instead of rounded into agreement', () => {
  for (const candidate of [
    { record: reconciliation({ statementEndingBalance: 100.001 }), bank: account },
    { record: reconciliation(), bank: { ...account, currentBalance: 100.001 } },
  ]) {
    const metrics = buildReconciliationCloseMetrics(candidate.record, candidate.bank);
    assert.equal(metrics.isReadyToApprove, false);
  }
});

test('balances outside safe integer minor-unit precision cannot approve close', () => {
  const amount = 100_000_000_000_000;
  for (const candidate of [
    { record: reconciliation({ statementEndingBalance: amount }), bank: { ...account, currentBalance: amount } },
    { record: reconciliation(), bank: { ...account, currentBalance: amount } },
  ]) {
    const metrics = buildReconciliationCloseMetrics(candidate.record, candidate.bank);
    assert.equal(metrics.isReadyToApprove, false);
  }
});

test('sub-cent drift smaller than the former rounding tolerance is never accepted', () => {
  for (const amount of [100.0000000001, 99.9999999999, -0.0000000001]) {
    const invalidStatement = buildReconciliationCloseMetrics(
      reconciliation({ statementEndingBalance: amount }),
      account
    );
    assert.equal(invalidStatement.isReadyToApprove, false, String(amount));
    assert.match(invalidStatement.blockedReason, /valid statement/i);

    const invalidBook = buildReconciliationCloseMetrics(
      reconciliation(),
      { ...account, currentBalance: amount }
    );
    assert.equal(invalidBook.isReadyToApprove, false, String(amount));
    assert.match(invalidBook.blockedReason, /valid book balance/i);
  }
});

test('valid decimal cent amounts remain eligible without rejecting floating multiplication noise', () => {
  for (const amount of [0.29, -0.29, 100.01, 0]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ statementEndingBalance: amount }),
      { ...account, currentBalance: amount }
    );
    assert.equal(metrics.isReadyToApprove, true, String(amount));
  }
});

test('approved reconciliation without complete controller signoff evidence fails closed', () => {
  const baseline = {
    closeApprovalStatus: 'approved',
    controllerSignoffName: 'Controller A',
    controllerSignoffAt: '2026-10-28T18:00:00Z',
  };
  for (const invalid of [
    { controllerSignoffName: undefined },
    { controllerSignoffName: '  ' },
    { controllerSignoffAt: undefined },
    { controllerSignoffAt: 'not-a-date' },
    { controllerSignoffAt: '2026-10-28' },
    { controllerSignoffAt: '2026-13-28T18:00:00Z' },
  ]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ ...baseline, ...invalid }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, JSON.stringify(invalid));
    assert.match(metrics.blockedReason, /named controller and valid signoff timestamp/);
  }
});

test('approved reconciliation with named controller and offset ISO signoff retains eligibility', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({
      closeApprovalStatus: 'approved',
      controllerSignoffName: 'Controller A',
      controllerSignoffAt: '2026-10-28T14:00:00-04:00',
    }),
    account
  );
  assert.equal(metrics.isReadyToApprove, true);
});

test('missing controller approval state cannot silently qualify as pending review', () => {
  for (const closeApprovalStatus of [undefined, null, '']) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ closeApprovalStatus }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, String(closeApprovalStatus));
    assert.match(metrics.blockedReason, /explicit pending or approved controller state/);
  }
});

test('unknown or malformed controller approval states cannot authorize close', () => {
  for (const closeApprovalStatus of ['unknown', 'PENDING', 'rejected', true, 1]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ closeApprovalStatus }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, String(closeApprovalStatus));
    assert.match(metrics.blockedReason, /explicit pending or approved controller state/);
  }
});

test('pending controller approval is still eligible for review without a signoff', () => {
  const metrics = buildReconciliationCloseMetrics(reconciliation(), account);
  assert.equal(metrics.isReadyToApprove, true);
});


test('impossible controller signoff calendar dates cannot authorize close', () => {
  for (const controllerSignoffAt of [
    '2026-02-30T18:00:00Z',
    '2025-02-29T18:00:00Z',
    '2026-04-31T18:00:00Z',
    '2026-00-28T18:00:00Z',
  ]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ closeApprovalStatus: 'approved', controllerSignoffName: 'Controller A', controllerSignoffAt }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, controllerSignoffAt);
    assert.match(metrics.blockedReason, /valid signoff timestamp/);
  }
});

test('invalid controller signoff clock times and timezone offsets fail closed', () => {
  for (const controllerSignoffAt of [
    '2026-10-28T24:00:00Z',
    '2026-10-28T18:60:00Z',
    '2026-10-28T18:00:60Z',
    '2026-10-28T18:00:00+15:00',
    '2026-10-28T18:00:00-14:01',
    '2026-10-28T18:00:00+04:60',
  ]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ closeApprovalStatus: 'approved', controllerSignoffName: 'Controller A', controllerSignoffAt }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, controllerSignoffAt);
    assert.match(metrics.blockedReason, /valid signoff timestamp/);
  }
});

test('real leap-day controller signoffs and valid timezone offsets remain eligible', () => {
  for (const controllerSignoffAt of [
    '2024-02-29T23:59:59.123Z',
    '2026-10-28T14:00:00-04:00',
    '2026-10-28T14:00:00+14:00',
    '2026-10-28T14:00:00-12:45',
  ]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({
        closeApprovalStatus: 'approved',
        controllerSignoffName: 'Controller A',
        controllerSignoffAt,
        ...(controllerSignoffAt.startsWith('2024-')
          ? {
              statementImportedAt: '2024-02-28T12:00:00Z',
              periodStart: '2024-02-01',
              periodEnd: '2024-02-29',
              parsedStatementLines: [statementLine('line-1', 'matched', { postedDate: '2024-02-29' })],
            }
          : {}),
      }),
      account
    );
    assert.equal(metrics.isReadyToApprove, true, controllerSignoffAt);
  }
});

test('malformed statement provenance never qualifies for automatic reconciliation close', () => {
  for (const invalid of [
    { statementImportId: '' },
    { statementImportId: '  ' },
    { statementImportId: ' import-a' },
    { statementImportId: 'import-a ' },
    { statementImportId: 'import\n-a' },
    { statementImportId: 42 },
    { statementImportId: null, statementFileName: '  ' },
    { statementImportId: null, statementFileName: 'bank\tstatement.csv' },
    { statementImportId: null, statementFileName: false },
    { statementImportId: '  ', statementFileName: 'bank.csv' },
  ]) {
    const metrics = buildReconciliationCloseMetrics(reconciliation(invalid), account);
    assert.equal(metrics.isReadyToApprove, false, JSON.stringify(invalid));
    assert.match(metrics.blockedReason, /Import a statement/);
  }
});

test('valid imported statement identifiers and legacy filename-only provenance remain eligible', () => {
  for (const valid of [
    { statementImportId: 'import-a', statementFileName: undefined },
    { statementImportId: null, statementFileName: 'bank-statement.csv' },
    { statementImportId: undefined, statementFileName: 'bank-statement.csv' },
    { statementImportId: 'import-a', statementFileName: 'bank-statement.csv' },
  ]) {
    const metrics = buildReconciliationCloseMetrics(reconciliation(valid), account);
    assert.equal(metrics.isReadyToApprove, true, JSON.stringify(valid));
  }
});

test('malformed unmatched index never masquerades as zero outstanding exceptions', () => {
  for (const unmatchedStatementLineIds of ['', 'line-2', null, 42, {}, [''], ['  '], ['line\n-2'], [42]]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ unmatchedStatementLineIds }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, JSON.stringify(unmatchedStatementLineIds));
    assert.match(metrics.blockedReason, /Unmatched statement-line identifiers/);
  }
  assert.equal(buildReconciliationCloseMetrics(
    reconciliation({ unmatchedStatementLineIds: [] }),
    account
  ).isReadyToApprove, true);
});

test('padded and control-character parsed or matched row identifiers cannot approve close', () => {
  for (const id of [' line-1', 'line-1 ', 'line\t-1', 'line\n-1', 'line\u0085-1']) {
    const parsed = buildReconciliationCloseMetrics(
      reconciliation({
        parsedStatementLines: [{ id, matchStatus: 'matched' }],
        matchedStatementLineIds: [id],
      }),
      account
    );
    assert.equal(parsed.isReadyToApprove, false, JSON.stringify(id));
    assert.match(parsed.blockedReason, /unique, nonempty identifiers/);

    const indexed = buildReconciliationCloseMetrics(
      reconciliation({ matchedStatementLineIds: [id] }),
      account
    );
    assert.equal(indexed.isReadyToApprove, false, JSON.stringify(id));
    assert.match(indexed.blockedReason, /must agree with reviewed source rows/);
  }
});


test('malformed parsed statement collections fail closed without throwing', () => {
  for (const parsedStatementLines of [
    '',
    'line-1',
    42,
    {},
    statementLine('line-1', 'matched'),
    [statementLine('line-1', 'matched'), null],
    [statementLine('line-1', 'matched'), 'line-2'],
    [statementLine('line-1', 'matched'), ['line-2']],
  ]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ parsedStatementLines }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, JSON.stringify(parsedStatementLines));
    assert.match(metrics.blockedReason, /valid array of source rows/);
  }
});

test('missing or empty parsed rows remain blocked by the existing import-review gate', () => {
  for (const parsedStatementLines of [null, undefined, []]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ parsedStatementLines }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, String(parsedStatementLines));
    assert.match(metrics.blockedReason, /Statement lines must be imported/);
  }
  assert.equal(buildReconciliationCloseMetrics(reconciliation(), account).isReadyToApprove, true);
});

test('reconciliation identity is required even when balances and review tie', () => {
  for (const id of [undefined, null, '', '  ', ' reconciliation-a', 'reconciliation-a ', 'reconciliation\n-a', 42]) {
    const metrics = buildReconciliationCloseMetrics(reconciliation({ id }), account);
    assert.equal(metrics.isReadyToApprove, false, String(id));
    assert.match(metrics.blockedReason, /valid scoped identifiers/);
  }
  assert.equal(buildReconciliationCloseMetrics(reconciliation(), account).isReadyToApprove, true);
});

test('matching missing or malformed bank/entity IDs cannot authorize reconciliation close', () => {
  for (const candidate of [
    { record: { bankAccountId: undefined }, bank: { id: undefined } },
    { record: { entityId: undefined }, bank: { entityId: undefined } },
    { record: { bankAccountId: 'bank-a ' }, bank: { id: 'bank-a ' } },
    { record: { entityId: ' entity-a' }, bank: { entityId: ' entity-a' } },
    { record: { bankAccountId: 'bank-a\n' }, bank: { id: 'bank-a\n' } },
    { record: { entityId: 42 }, bank: { entityId: 42 } },
  ]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation(candidate.record),
      { ...account, ...candidate.bank }
    );
    assert.equal(metrics.isReadyToApprove, false, JSON.stringify(candidate));
    assert.match(metrics.blockedReason, /valid scoped identifiers/);
  }
  assert.equal(buildReconciliationCloseMetrics(reconciliation(), account).isReadyToApprove, true);
});

test('malformed imported statement financial rows cannot approve a balance-matched close', () => {
  const invalidRows = [
    { amount: undefined },
    { amount: null },
    { amount: Number.NaN },
    { amount: Number.POSITIVE_INFINITY },
    { amount: 0 },
    { amount: 25.751 },
    { amount: '25.75' },
    { direction: undefined },
    { direction: 'transfer' },
    { postedDate: undefined },
    { postedDate: '2026-02-30' },
    { postedDate: '2025-02-29' },
    { postedDate: '2026-13-01' },
    { postedDate: '10/28/2026' },
    { description: undefined },
    { description: ' ' },
    { description: 'Bank\ntransaction' },
  ];
  for (const invalid of invalidRows) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({
        parsedStatementLines: [statementLine('line-1', 'matched', invalid)],
      }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, JSON.stringify(invalid));
    assert.match(metrics.blockedReason, /Imported statement rows require valid/);
  }
});

test('valid exact-cent statement rows and real leap dates retain eligibility', () => {
  for (const valid of [
    { postedDate: '2024-02-29', amount: -25.75, direction: 'debit' },
    { postedDate: '2026-10-28', amount: 0.01, direction: 'credit' },
    { postedDate: '2026-10-28', amount: 25.75, direction: 'debit' },
  ]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({
        ...(valid.postedDate === '2024-02-29'
          ? { periodStart: '2024-02-01', periodEnd: '2024-02-29' }
          : {}),
        parsedStatementLines: [statementLine('line-1', 'matched', valid)],
      }),
      account
    );
    assert.equal(metrics.isReadyToApprove, true, JSON.stringify(valid));
  }
});


test('reconciliation cannot approve malformed or reversed statement periods', () => {
  for (const invalid of [
    { periodStart: undefined },
    { periodEnd: null },
    { periodStart: '2026-02-30' },
    { periodEnd: '2026-11-31' },
    { periodStart: '2026-10-31', periodEnd: '2026-10-01' },
    { periodStart: '2026-10-01T00:00:00Z' },
  ]) {
    const metrics = buildReconciliationCloseMetrics(reconciliation(invalid), account);
    assert.equal(metrics.isReadyToApprove, false, JSON.stringify(invalid));
    assert.match(metrics.blockedReason, /Statement period and imported posting dates/);
  }
});

test('matched rows outside the reconciliation period cannot authorize close', () => {
  for (const postedDate of ['2026-09-30', '2026-11-01']) {
    const metrics = buildReconciliationCloseMetrics(reconciliation({
      parsedStatementLines: [statementLine('line-1', 'matched', { postedDate })],
    }), account);
    assert.equal(metrics.isReadyToApprove, false, postedDate);
    assert.match(metrics.blockedReason, /Statement period and imported posting dates/);
  }
});

test('valid inclusive statement boundaries and leap-day period remain eligible', () => {
  for (const postedDate of ['2026-10-01', '2026-10-31']) {
    assert.equal(buildReconciliationCloseMetrics(reconciliation({
      parsedStatementLines: [statementLine('line-1', 'matched', { postedDate })],
    }), account).isReadyToApprove, true, postedDate);
  }
  assert.equal(buildReconciliationCloseMetrics(reconciliation({
    periodStart: '2024-02-01',
    periodEnd: '2024-02-29',
    parsedStatementLines: [statementLine('line-1', 'matched', { postedDate: '2024-02-29' })],
  }), account).isReadyToApprove, true);
});

test('unresolved book-side transactions block close despite matched statement lines and balanced totals', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ unmatchedTransactionIds: ['ledger-unresolved'] }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
  assert.match(metrics.blockedReason, /Unresolved book transactions/);
});

test('missing unmatched book index requires explicit review instead of treating legacy absence as empty', () => {
  for (const missing of [undefined, null]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ unmatchedTransactionIds: missing }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, String(missing));
    assert.match(metrics.blockedReason, /Cleared and unmatched book transaction identifiers/);
  }
  const legacy = reconciliation();
  delete legacy.unmatchedTransactionIds;
  assert.equal(buildReconciliationCloseMetrics(legacy, account).isReadyToApprove, false);
  assert.equal(buildReconciliationCloseMetrics(
    reconciliation({ unmatchedTransactionIds: [] }),
    account
  ).isReadyToApprove, true);
});

test('malformed, duplicate and overlapping book transaction indices cannot approve close', () => {
  const invalid = [
    { clearedTransactionIds: undefined },
    { clearedTransactionIds: null },
    { clearedTransactionIds: 'ledger-1' },
    { clearedTransactionIds: ['ledger-1', 'ledger-1'] },
    { clearedTransactionIds: ['ledger-1', ' ledger-2'] },
    { clearedTransactionIds: ['ledger-1', 42] },
    { unmatchedTransactionIds: null },
    { unmatchedTransactionIds: 'ledger-2' },
    { unmatchedTransactionIds: ['ledger-2', 'ledger-2'] },
    { unmatchedTransactionIds: ['ledger-1'] },
  ];
  for (const overrides of invalid) {
    const metrics = buildReconciliationCloseMetrics(reconciliation(overrides), account);
    assert.equal(metrics.isReadyToApprove, false, JSON.stringify(overrides));
    assert.match(metrics.blockedReason, /Cleared and unmatched book transaction identifiers/);
  }
});

test('matched statement rows without any cleared book transaction cannot approve close', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ clearedTransactionIds: [], unmatchedTransactionIds: [] }),
    account
  );
  assert.equal(metrics.isReadyToApprove, false);
  assert.equal(metrics.matchedLineCount, 1);
  assert.match(metrics.blockedReason, /require at least one reviewed cleared book transaction/);
  assert.equal(buildReconciliationCloseMetrics(reconciliation(), account).isReadyToApprove, true);
});

test('unique cleared book IDs with no outstanding book exceptions preserve approval eligibility', () => {
  const metrics = buildReconciliationCloseMetrics(reconciliation({
    clearedTransactionIds: ['ledger-1', 'ledger-2'],
    unmatchedTransactionIds: [],
  }), account);
  assert.equal(metrics.isReadyToApprove, true);
});


test('future-dated controller signoffs cannot certify completed approval', () => {
  const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const skew = new Date(Date.now() + 60 * 1000).toISOString();
  for (const controllerSignoffAt of [future, '2999-01-01T00:00:00Z']) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({ closeApprovalStatus: 'approved', controllerSignoffName: 'Controller A', controllerSignoffAt }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, controllerSignoffAt);
    assert.match(metrics.blockedReason, /valid signoff timestamp/);
  }
  const allowedSkew = buildReconciliationCloseMetrics(
    reconciliation({ closeApprovalStatus: 'approved', controllerSignoffName: 'Controller A', controllerSignoffAt: skew }),
    account
  );
  assert.equal(allowedSkew.isReadyToApprove, true, 'one-minute clock skew should remain eligible');
});

test('approved controller signoff rejects padded and control-character names', () => {
  for (const controllerSignoffName of [
    ' Controller A', 'Controller A ', 'Controller\nA', 'Controller\tA',
    'Controller\u0085A', 42,
  ]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({
        closeApprovalStatus: 'approved',
        controllerSignoffName,
        controllerSignoffAt: '2026-10-28T18:00:00Z',
      }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, JSON.stringify(controllerSignoffName));
    assert.match(metrics.blockedReason, /named controller and valid signoff timestamp/);
  }

  for (const controllerSignoffName of ['Controller A', 'María García']) {
    assert.equal(buildReconciliationCloseMetrics(
      reconciliation({
        closeApprovalStatus: 'approved',
        controllerSignoffName,
        controllerSignoffAt: '2026-10-28T18:00:00Z',
      }),
      account
    ).isReadyToApprove, true, controllerSignoffName);
  }
});

test('approved close requires an imported statement timestamp rather than replaying legacy signoff', () => {
  for (const statementImportedAt of [undefined, null, '', 'not-a-date', '2026-02-30T12:00:00Z', '2999-01-01T00:00:00Z']) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({
        closeApprovalStatus: 'approved',
        controllerSignoffName: 'Controller A',
        controllerSignoffAt: '2026-10-28T18:00:00Z',
        statementImportedAt,
      }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, String(statementImportedAt));
    assert.match(metrics.blockedReason, /valid statement import timestamp/);
  }
});

test('controller signoff must occur after statement import even across timezone offsets', () => {
  for (const [statementImportedAt, controllerSignoffAt, allowed] of [
    ['2026-10-28T19:00:00Z', '2026-10-28T18:00:00Z', false],
    ['2026-10-28T14:00:01-04:00', '2026-10-28T18:00:00Z', false],
    ['2026-10-28T18:00:00Z', '2026-10-28T18:00:00Z', true],
    ['2026-10-28T14:00:00-04:00', '2026-10-28T18:01:00Z', true],
  ]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({
        closeApprovalStatus: 'approved',
        controllerSignoffName: 'Controller A',
        statementImportedAt,
        controllerSignoffAt,
      }),
      account
    );
    assert.equal(metrics.isReadyToApprove, allowed, JSON.stringify({ statementImportedAt, controllerSignoffAt }));
    if (!allowed) assert.match(metrics.blockedReason, /must follow a valid statement import timestamp/);
  }
});

test('pending controller review does not require an approval timestamp', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ closeApprovalStatus: 'pending', statementImportedAt: undefined }),
    account
  );
  assert.equal(metrics.isReadyToApprove, true);
});

test('controller approval rejects statement-row resolutions outside the import-to-signoff window', () => {
  const approval = {
    closeApprovalStatus: 'approved',
    controllerSignoffName: 'Controller A',
    controllerSignoffAt: '2026-10-28T18:00:00Z',
  };
  for (const resolvedAt of [
    '2026-10-27T11:59:59Z', // resolution before statement import
    '2026-10-28T18:00:01Z', // resolution after controller approval
    '2026-02-30T12:00:00Z', // normalized impossible date
    'not-a-timestamp',
    '',
    '2999-01-01T00:00:00Z',
  ]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({
        ...approval,
        parsedStatementLines: [statementLine('line-1', 'matched', { resolvedAt })],
      }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, resolvedAt);
    assert.match(metrics.blockedReason, /resolutions must follow import and precede controller approval/);
  }
});

test('valid row resolution evidence preserves approval eligibility across timezone offsets', () => {
  const approval = {
    closeApprovalStatus: 'approved',
    controllerSignoffName: 'Controller A',
    controllerSignoffAt: '2026-10-28T14:00:00-04:00',
  };
  for (const resolvedAt of [
    undefined, // legacy row without a resolution timestamp
    '2026-10-27T12:00:00Z', // import boundary
    '2026-10-28T17:59:59Z',
    '2026-10-28T14:00:00-04:00', // approval boundary
  ]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({
        ...approval,
        parsedStatementLines: [statementLine('line-1', 'matched', { resolvedAt })],
      }),
      account
    );
    assert.equal(metrics.isReadyToApprove, true, String(resolvedAt));
  }
  // Pending controller review remains eligible for review; it is not a close.
  assert.equal(buildReconciliationCloseMetrics(reconciliation({
    parsedStatementLines: [statementLine('line-1', 'matched', { resolvedAt: '2026-10-28T19:00:00Z' })],
  }), account).isReadyToApprove, true);
});

test('invisible Unicode format controls cannot spoof reconciliation scope or source identities', () => {
  for (const hidden of ['\u200b', '\u200d', '\u202e', '\u2066', '\u2069']) {
    for (const field of ['id', 'entityId', 'bankAccountId']) {
      const metrics = buildReconciliationCloseMetrics(
        reconciliation({ [field]: `valid${hidden}identity` }), account
      );
      assert.equal(metrics.isReadyToApprove, false, `${field} ${hidden.codePointAt(0).toString(16)}`);
      assert.match(metrics.blockedReason, /valid scoped identifiers/);
    }
    const imported = buildReconciliationCloseMetrics(
      reconciliation({ statementImportId: `import${hidden}a` }), account
    );
    assert.equal(imported.isReadyToApprove, false);
    assert.match(imported.blockedReason, /Import a statement/);
    const row = buildReconciliationCloseMetrics(
      reconciliation({
        parsedStatementLines: [statementLine(`line${hidden}1`, 'matched')],
        matchedStatementLineIds: [`line${hidden}1`],
      }), account
    );
    assert.equal(row.isReadyToApprove, false);
    assert.match(row.blockedReason, /unique, nonempty identifiers/);
  }
});

test('format-control descriptions and controller names fail closed without rejecting ordinary Unicode', () => {
  for (const hidden of ['\u200b', '\u202e', '\u2066']) {
    const row = buildReconciliationCloseMetrics(
      reconciliation({ parsedStatementLines: [statementLine('line-1', 'matched', {
        description: `Bank${hidden}payment`,
      })] }), account
    );
    assert.equal(row.isReadyToApprove, false);
    assert.match(row.blockedReason, /Imported statement rows require valid/);
    const controller = buildReconciliationCloseMetrics(
      reconciliation({
        closeApprovalStatus: 'approved',
        controllerSignoffName: `Controller${hidden}A`,
        controllerSignoffAt: '2026-10-28T18:00:00Z',
      }), account
    );
    assert.equal(controller.isReadyToApprove, false);
    assert.match(controller.blockedReason, /named controller and valid signoff timestamp/);
  }
  const valid = buildReconciliationCloseMetrics(
    reconciliation({
      closeApprovalStatus: 'approved',
      controllerSignoffName: 'María García',
      controllerSignoffAt: '2026-10-28T18:00:00Z',
      parsedStatementLines: [statementLine('line-1', 'matched', {
        description: 'Café – dépôt reçu',
      })],
    }), account
  );
  assert.equal(valid.isReadyToApprove, true);
});


test('raw imported amount must agree with normalized statement cents before close eligibility', () => {
  for (const rawAmountText of ['25.76', '0.25', '25.751', '25.75 CR', '25.75\\u200b', '', ' 25.75', '25.75 ', '$25,75', '1,23.45', 25.75]) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({
        parsedStatementLines: [statementLine('line-1', 'matched', { rawAmountText })],
      }),
      account
    );
    assert.equal(metrics.isReadyToApprove, false, `conflicting raw amount ${String(rawAmountText)} must block`);
    assert.match(metrics.blockedReason, /Imported statement rows require valid/);
  }
});

test('exact-cent raw bank amount formats preserve eligible reviewed rows', () => {
  for (const rawAmountText of ['25.75', '$25.75', '-25.75', '(25.75)', '+$25.75', '025.75']) {
    const metrics = buildReconciliationCloseMetrics(
      reconciliation({
        parsedStatementLines: [statementLine('line-1', 'matched', { rawAmountText })],
      }),
      account
    );
    assert.equal(metrics.isReadyToApprove, true, `valid raw amount ${rawAmountText} should match`);
  }
  const grouped = buildReconciliationCloseMetrics(
    reconciliation({
      parsedStatementLines: [statementLine('line-1', 'matched', {
        amount: 1234.56,
        rawAmountText: '$1,234.56',
      })],
    }),
    account
  );
  assert.equal(grouped.isReadyToApprove, true);
});
