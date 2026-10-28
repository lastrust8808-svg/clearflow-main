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
