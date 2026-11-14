import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-replace-kind', entityId: 'entity-replace-kind', trustId: 'trust-replace-kind' };
const original = { ...scope, eventId: 'record-cash', type: 'asset_recorded',
  assetId: 'cash-old', evidenceRef: 'evidence-old', occurredAt: '2026-11-10T10:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0 };
const removed = { ...scope, eventId: 'remove-cash', type: 'asset_removed',
  assetId: 'cash-old', evidenceRef: 'evidence-removal', occurredAt: '2026-11-10T10:00:00.001Z' };
const noncash = { ...original, eventId: 'record-collateral', assetId: 'collateral-new',
  evidenceRef: 'evidence-collateral', occurredAt: '2026-11-10T10:00:00.002Z',
  kind: 'noncash_collateral', sourceType: 'other_collateral', amountMinor: 9000 };
delete noncash.restrictedMinor;
delete noncash.pledgedMinor;
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-10T10:00:00.003Z', maxEvidenceAgeMs: 86400000, events });

test('removing cash and appending noncash collateral never restores spendable cash', () => {
  const before = snapshot([original]);
  const after = snapshot([original, removed, noncash]);
  const projection = verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256);
  assert.equal(projection.activeAssetCount, 1);
  assert.equal(projection.removedAssetCount, 1);
  assert.equal(projection.unencumberedCashMinor, 0);
});

test('replacement cash cannot omit encumbrance declarations after removal', () => {
  const before = snapshot([original, removed]);
  const replacement = { ...original, eventId: 'record-replacement', assetId: 'cash-new',
    evidenceRef: 'evidence-new', occurredAt: '2026-11-10T10:00:00.002Z' };
  delete replacement.pledgedMinor;
  const checkpoint = projectReserveJournal(before).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(before,
    snapshot([original, removed, replacement]), checkpoint));
  assert.equal(projectReserveJournal(before).checkpointSha256, checkpoint);
});
