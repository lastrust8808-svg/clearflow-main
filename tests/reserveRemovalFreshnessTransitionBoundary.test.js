import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-freshness-transition', entityId: 'entity-freshness-transition', trustId: 'trust-freshness-transition' };
const cash = { ...scope, eventId: 'cash-record', type: 'asset_recorded', assetId: 'cash-asset',
  evidenceRef: 'cash-evidence', occurredAt: '2026-11-10T10:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance', amountMinor: 10000,
  restrictedMinor: 1000, pledgedMinor: 1000 };
const removal = { ...scope, eventId: 'cash-removal', type: 'asset_removed', assetId: 'cash-asset',
  evidenceRef: 'cash-removal-evidence', occurredAt: '2026-11-10T10:00:00.001Z' };
const noncash = { ...cash, eventId: 'collateral-record', assetId: 'collateral-asset',
  evidenceRef: 'collateral-evidence', occurredAt: '2026-11-10T10:00:00.002Z',
  kind: 'noncash', sourceType: 'documented_asset', amountMinor: 20000,
  restrictedMinor: 0, pledgedMinor: 0 };
const snapshot = (events, asOfAt, maxEvidenceAgeMs = 1000) =>
  ({ ...scope, currency: 'USD', asOfAt, maxEvidenceAgeMs, events });

test('advancing as-of time does not resurrect removed cash when noncash collateral is appended', () => {
  const before = snapshot([cash, removal], '2026-11-10T10:00:00.001Z');
  const after = snapshot([cash, removal, noncash], '2026-11-10T10:00:00.500Z');
  const projection = verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256);
  assert.equal(projection.activeAssetCount, 1);
  assert.equal(projection.removedAssetCount, 1);
  assert.equal(projection.unencumberedCashMinor, 0);
});

test('append cannot extend evidence freshness policy to make old cash appear available', () => {
  const before = snapshot([cash], '2026-11-10T10:00:00.000Z');
  const after = snapshot([cash, noncash], '2026-11-10T10:00:00.500Z', 86400000);
  const checkpoint = projectReserveJournal(before).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(before, after, checkpoint),
    /cannot change evidence freshness policy/);
  assert.equal(projectReserveJournal(before).checkpointSha256, checkpoint);
});
