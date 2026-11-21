import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-pledge-transition', entityId: 'entity-pledge-transition', trustId: 'trust-pledge-transition' };
const at = ['2026-11-10T10:00:00.000Z','2026-11-10T10:00:00.001Z','2026-11-10T10:00:00.002Z'];
const cash = { ...scope, eventId: 'record-old', type: 'asset_recorded', assetId: 'old-cash',
  evidenceRef: 'old-bank-evidence', occurredAt: at[0], currency: 'USD',
  kind: 'cash', sourceType: 'bank_balance', amountMinor: 10000,
  restrictedMinor: 2000, pledgedMinor: 3000 };
const removal = { ...scope, eventId: 'remove-old', type: 'asset_removed',
  assetId: 'old-cash', evidenceRef: 'removal-evidence', occurredAt: at[1] };
const replacement = { ...cash, eventId: 'record-new', assetId: 'new-cash',
  evidenceRef: 'new-bank-evidence', occurredAt: at[2],
  amountMinor: 4000, restrictedMinor: 1000, pledgedMinor: 2000 };
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-10T10:00:01.000Z', maxEvidenceAgeMs: 86400000, events });

test('cash replacement counts only new independently encumbered cash', () => {
  const before = snapshot([cash, removal]);
  const after = snapshot([cash, removal, replacement]);
  const result = verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.unencumberedCashMinor, 1000);
});

test('replacement cannot recycle removal evidence as new cash provenance', () => {
  const before = snapshot([cash, removal]);
  const checkpoint = projectReserveJournal(before).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(before,
    snapshot([cash, removal, { ...replacement, evidenceRef: removal.evidenceRef }]),
    checkpoint));
  assert.equal(projectReserveJournal(before).checkpointSha256, checkpoint);
});

test('replacement cannot recycle old bank evidence even under a new asset ID', () => {
  const before = snapshot([cash, removal]);
  const checkpoint = projectReserveJournal(before).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(before,
    snapshot([cash, removal, { ...replacement, evidenceRef: cash.evidenceRef }]),
    checkpoint));
  assert.equal(projectReserveJournal(before).checkpointSha256, checkpoint);
});
