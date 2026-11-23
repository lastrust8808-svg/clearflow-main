import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-stale-append', entityId: 'entity-stale-append', trustId: 'trust-stale-append' };
const oldCash = { ...scope, eventId: 'old-record', type: 'asset_recorded',
  assetId: 'old-cash', evidenceRef: 'old-bank-proof', occurredAt: '2026-11-10T10:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 5000, restrictedMinor: 0, pledgedMinor: 0 };
const freshCollateral = { ...scope, eventId: 'new-record', type: 'asset_recorded',
  assetId: 'new-collateral', evidenceRef: 'new-collateral-proof',
  occurredAt: '2026-11-10T10:00:02.000Z', currency: 'USD',
  kind: 'noncash_collateral', sourceType: 'other_collateral', amountMinor: 8000 };
const removal = { ...scope, eventId: 'old-removal', type: 'asset_removed',
  assetId: 'old-cash', evidenceRef: 'old-removal-proof',
  occurredAt: '2026-11-10T10:00:01.000Z' };
const snapshot = (events, asOfAt) => ({ ...scope, currency: 'USD',
  asOfAt, maxEvidenceAgeMs: 1000, events });

test('fresh collateral append cannot silently preserve expired active bank cash', () => {
  const before = snapshot([oldCash], '2026-11-10T10:00:00.500Z');
  const after = snapshot([oldCash, freshCollateral], '2026-11-10T10:00:02.000Z');
  const checkpoint = projectReserveJournal(before).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(before, after, checkpoint));
  assert.equal(projectReserveJournal(before).checkpointSha256, checkpoint);
});

test('explicit retirement of stale bank cash permits separately evidenced noncash collateral', () => {
  const before = snapshot([oldCash], '2026-11-10T10:00:00.500Z');
  const after = snapshot([oldCash, removal, freshCollateral], '2026-11-10T10:00:02.000Z');
  const result = verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.unencumberedCashMinor, 0);
});
