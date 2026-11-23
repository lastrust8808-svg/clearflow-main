import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-removal-fields', entityId: 'entity-removal-fields', trustId: 'trust-removal-fields' };
const recorded = {
  ...scope, eventId: 'event-recorded', type: 'asset_recorded', assetId: 'asset-one',
  evidenceRef: 'receipt-recorded', occurredAt: '2026-11-12T10:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 100, restrictedMinor: 0, pledgedMinor: 0,
};
const removal = {
  ...scope, eventId: 'event-removed', type: 'asset_removed', assetId: 'asset-one',
  evidenceRef: 'receipt-removed', occurredAt: '2026-11-12T10:00:00.001Z',
};
const snapshot = (events, asOfAt) => ({
  ...scope, currency: 'USD', maxEvidenceAgeMs: 86_400_000, asOfAt, events,
});

test('removal cannot smuggle a replacement amount or currency into the journal', () => {
  for (const extra of [
    { amountMinor: 0 }, { currency: 'EUR' }, { kind: 'noncash' },
    { restrictedMinor: 0 }, { pledgedMinor: 0 }, { sourceType: 'appraisal' },
  ]) {
    assert.throws(
      () => projectReserveJournal(snapshot([recorded, { ...removal, ...extra }], '2026-11-12T10:00:00.002Z')),
      /Unsupported Reserve journal event field/,
    );
  }
});

test('append rejects a removal with valuation metadata without changing predecessor checkpoint', () => {
  const before = snapshot([recorded], '2026-11-12T10:00:00.000Z');
  const checkpoint = projectReserveJournal(before).checkpointSha256;
  const next = snapshot([recorded, { ...removal, amountMinor: 0 }], '2026-11-12T10:00:00.001Z');
  assert.throws(() => verifyReserveJournalAppend(before, next, checkpoint), /Unsupported Reserve journal event field/);
  assert.equal(projectReserveJournal(before).checkpointSha256, checkpoint);
});

test('ordinary removal without valuation metadata remains valid', () => {
  const result = projectReserveJournal(snapshot([recorded, removal], '2026-11-12T10:00:00.002Z'));
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.activeAssetCount, 0);
});
