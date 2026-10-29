import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReconciliationCloseMetrics } from '../src/services/reconciliationControls.service.ts';

const account = {
  id: 'bank-a',
  entityId: 'entity-a',
  currentBalance: 100,
};

function reconciliation(overrides = {}) {
  return {
    id: 'reconciliation-a',
    entityId: 'entity-a',
    bankAccountId: 'bank-a',
    statementEndingBalance: 100,
    statementImportId: 'import-a',
    statementReviewStatus: 'ready_to_close',
    status: 'in_review',
    closeApprovalStatus: 'pending',
    matchedStatementLineIds: ['line-1'],
    unmatchedStatementLineIds: [],
    parsedStatementLines: [{ id: 'line-1', matchStatus: 'matched' }],
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
        parsedStatementLines: [{ id: 'line-1', matchStatus: status }],
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
        { id: 'line-1', matchStatus: 'matched' },
        { id: 'line-1', matchStatus: 'matched' },
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
        { id: 'line-1', matchStatus: 'matched' },
        { id: 'line-2', matchStatus: 'suggested' },
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

test('legacy parsed statements without a matched-index list remain eligible when fully reviewed', () => {
  const metrics = buildReconciliationCloseMetrics(
    reconciliation({ matchedStatementLineIds: undefined }),
    account
  );
  assert.equal(metrics.isReadyToApprove, true);
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
      reconciliation({ closeApprovalStatus: 'approved', controllerSignoffName: 'Controller A', controllerSignoffAt }),
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
  for (const unmatchedStatementLineIds of ['', 'line-2', null, 42, {}, [''], ['  '], ['line\\n-2'], [42]]) {
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
  for (const id of [' line-1', 'line-1 ', 'line\\t-1', 'line\\n-1', 'line\\u0085-1']) {
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
