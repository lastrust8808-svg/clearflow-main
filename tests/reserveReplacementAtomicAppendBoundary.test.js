import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-replacement', entityId: 'entity-replacement', trustId: 'trust-replacement' };
const oldAsset = { ...scope, eventId: 'record-old', type: 'asset_recorded',
  assetId: 'old-cash', evidenceRef: 'bank-old', occurredAt: '2026-11-10T10:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 1000, restrictedMinor: 200, pledgedMinor: 100 };
const removal = { ...scope, eventId: 'remove-old', type: 'asset_removed',
  assetId: 'old-cash', evidenceRef: 'removal-receipt',
  occurredAt: '2026-11-10T10:00:00.001Z' };
const replacement = { ...oldAsset, eventId: 'record-new', assetId: 'new-cash',
  evidenceRef: 'bank-new', occurredAt: '2026-11-10T10:00:00.002Z',
  amountMinor: 400, restrictedMinor: 50, pledgedMinor: 0 };
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-10T10:00:00.003Z', maxEvidenceAgeMs: 86400000, events });

test('one append can retire old cash and record separately evidenced replacement without double-counting', () => {
  const before = snapshot([oldAsset]);
  const after = snapshot([oldAsset, removal, replacement]);
  const result = verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256);
  assert.equal(result.journalEventCount, 3);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.unencumberedCashMinor, 350);
});

test('replacement evidence cannot reuse the removed asset evidence receipt', () => {
  const before = snapshot([oldAsset, removal]);
  const after = snapshot([oldAsset, removal, { ...replacement, evidenceRef: 'bank-old' }]);
  const checkpoint = projectReserveJournal(before).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(before, after, checkpoint),
    /Reused reserve journal evidence reference/);
  assert.equal(projectReserveJournal(before).checkpointSha256, checkpoint);
});

test('replacement cannot reuse removed asset identity even with new evidence', () => {
  const before = snapshot([oldAsset, removal]);
  const after = snapshot([oldAsset, removal, { ...replacement, assetId: 'old-cash' }]);
  assert.throws(() => verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256),
    /cannot be recorded more than once/);
});
