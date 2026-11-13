import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-replacement-clock', entityId: 'entity-replacement-clock', trustId: 'trust-replacement-clock' };
const cash = { ...scope, eventId: 'cash-record', type: 'asset_recorded', assetId: 'cash-1', evidenceRef: 'cash-proof', occurredAt: '2026-11-10T10:00:00.000Z', currency: 'USD', kind: 'cash', sourceType: 'bank_balance', amountMinor: 5000, restrictedMinor: 0, pledgedMinor: 0 };
const replacement = { ...scope, eventId: 'collateral-record', type: 'asset_recorded', assetId: 'collateral-1', evidenceRef: 'collateral-proof', occurredAt: '2026-11-10T10:00:02.000Z', currency: 'USD', kind: 'noncash', sourceType: 'other', amountMinor: 7000 };
const snapshot = events => ({ ...scope, currency: 'USD', asOfAt: '2026-11-10T10:00:04.000Z', maxEvidenceAgeMs: 10000, events });

test('distinct replacement evidence cannot bypass strict journal chronology at identical timestamps', () => {
  const before = snapshot([cash]);
  const after = snapshot([cash, { ...replacement, occurredAt: cash.occurredAt }]);
  const checkpoint = projectReserveJournal(before).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(before, after, checkpoint), /timestamps must strictly increase/);
  assert.equal(projectReserveJournal(before).checkpointSha256, checkpoint);
});

test('chronologically later separately evidenced noncash append does not increase cash capacity', () => {
  const before = snapshot([cash]);
  const result = verifyReserveJournalAppend(before, snapshot([cash, replacement]), projectReserveJournal(before).checkpointSha256);
  assert.equal(result.unencumberedCashMinor, 5000);
  assert.equal(result.journalEventCount, 2);
});
