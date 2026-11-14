import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = {
  tenantId: 'tenant-source-boundary',
  entityId: 'entity-source-boundary',
  trustId: 'trust-source-boundary',
  currency: 'USD',
};
const entry = (kind, sourceType) => ({
  ...scope,
  id: 'entry-one',
  assetId: 'asset-one',
  evidenceRef: 'evidence-one',
  observedAt: '2026-11-11T00:00:00.000Z',
  kind,
  sourceType,
  amountMinor: 500,
  ...(kind === 'cash' ? { restrictedMinor: 0, pledgedMinor: 0 } : {}),
});
const project = entries => calculateReserveCapacity({
  ...scope,
  asOfAt: '2026-11-11T00:00:00.000Z',
  maxEvidenceAgeMs: 0,
  entries,
});

test('private notes and other collateral cannot masquerade as cash sources', () => {
  for (const sourceType of ['private_note', 'other_collateral']) {
    assert.throws(() => project([entry('cash', sourceType)]), /Cash reserve entry requires a cash source classification/);
  }
});

test('bank balances and physical cash cannot masquerade as noncash collateral', () => {
  for (const sourceType of ['bank_balance', 'physical_cash']) {
    assert.throws(() => project([entry('noncash_collateral', sourceType)]), /Noncash collateral requires a noncash source classification/);
  }
});

test('valid cash and noncash sources remain segregated in totals', () => {
  const cash = entry('cash', 'bank_balance');
  const note = {
    ...entry('noncash_collateral', 'private_note'),
    id: 'entry-two', assetId: 'asset-two', evidenceRef: 'evidence-two',
  };
  for (const entries of [[cash, note], [note, cash]]) {
    const result = project(entries);
    assert.equal(result.cashTotalMinor, 500);
    assert.equal(result.unencumberedCashMinor, 500);
    assert.equal(result.noncashCollateralMinor, 500);
  }
});
