import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-retirement-order', entityId: 'entity-retirement-order',
  trustId: 'trust-retirement-order' };
const recorded = { ...scope, eventId: 'record-cash', type: 'asset_recorded',
  assetId: 'cash-asset', evidenceRef: 'record-evidence',
  occurredAt: '2026-11-10T10:00:01.000Z', currency: 'USD',
  kind: 'cash', sourceType: 'bank_balance', amountMinor: 9000,
  restrictedMinor: 0, pledgedMinor: 0 };
const removal = { ...scope, eventId: 'remove-cash', type: 'asset_removed',
  assetId: 'cash-asset', evidenceRef: 'removal-evidence',
  occurredAt: '2026-11-10T10:00:02.000Z' };
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-10T10:00:03.000Z', maxEvidenceAgeMs: 10000, events });

test('retirement cannot be backdated before its recorded asset', () => {
  const before = snapshot([recorded]);
  const after = snapshot([recorded, { ...removal, occurredAt: '2026-11-10T10:00:00.000Z' }]);
  const checkpoint = projectReserveJournal(before).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(before, after, checkpoint),
    /timestamps must strictly increase/);
  assert.equal(projectReserveJournal(before).checkpointSha256, checkpoint);
});

test('retirement cannot share the asset-recording timestamp', () => {
  const before = snapshot([recorded]);
  const after = snapshot([recorded, { ...removal, occurredAt: recorded.occurredAt }]);
  assert.throws(() => verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256), /timestamps must strictly increase/);
});

test('strictly later retirement preserves history but removes cash capacity', () => {
  const before = snapshot([recorded]);
  const after = snapshot([recorded, removal]);
  const result = verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256);
  assert.equal(result.unencumberedCashMinor, 0);
  assert.equal(result.activeAssetCount, 0);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.journalEventCount, 2);
});
