import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-future-retirement', entityId: 'entity-future-retirement',
  trustId: 'trust-future-retirement' };
const cash = { ...scope, eventId: 'record-cash', type: 'asset_recorded',
  assetId: 'cash-asset', evidenceRef: 'cash-evidence',
  occurredAt: '2026-11-10T10:00:00.000Z', currency: 'USD',
  kind: 'cash', sourceType: 'bank_balance', amountMinor: 9000,
  restrictedMinor: 0, pledgedMinor: 0 };
const removal = { ...scope, eventId: 'retire-cash', type: 'asset_removed',
  assetId: 'cash-asset', evidenceRef: 'retirement-evidence',
  occurredAt: '2026-11-10T10:00:01.000Z' };
const snapshot = (events, asOfAt) => ({ ...scope, currency: 'USD',
  asOfAt, maxEvidenceAgeMs: 2000, events });

test('future-dated retirement cannot erase active cash before its effective instant', () => {
  const before = snapshot([cash], '2026-11-10T10:00:00.500Z');
  const after = snapshot([cash, removal], '2026-11-10T10:00:00.900Z');
  const checkpoint = projectReserveJournal(before).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(before, after, checkpoint),
    /after as-of time/);
  assert.equal(projectReserveJournal(before).unencumberedCashMinor, 9000);
  assert.equal(projectReserveJournal(before).checkpointSha256, checkpoint);
});

test('retirement at or after its timestamp removes cash without releasing funds', () => {
  const before = snapshot([cash], '2026-11-10T10:00:00.500Z');
  const after = snapshot([cash, removal], '2026-11-10T10:00:01.000Z');
  const result = verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256);
  assert.equal(result.unencumberedCashMinor, 0);
  assert.equal(result.activeAssetCount, 0);
  assert.equal(result.removedAssetCount, 1);
});
