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
