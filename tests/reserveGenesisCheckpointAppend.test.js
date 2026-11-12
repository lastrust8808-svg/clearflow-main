import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-genesis', entityId: 'entity-genesis', trustId: 'trust-genesis' };
const event = {
  ...scope, eventId: 'event-genesis', assetId: 'asset-genesis',
  evidenceRef: 'evidence-genesis', occurredAt: '2026-11-11T12:00:00.000Z',
  type: 'asset_recorded', currency: 'USD', kind: 'cash',
  sourceType: 'bank_balance', amountMinor: 1000,
  restrictedMinor: 0, pledgedMinor: 0
};
const snapshot = events => ({
  ...scope, currency: 'USD', asOfAt: '2026-11-11T13:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000, events
});

test('genesis checkpoint permits first append from an empty journal', () => {
  const before = snapshot([]);
  const after = snapshot([event]);
  const result = verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256);
  assert.equal(result.journalEventCount, 1);
  assert.equal(result.activeAssetCount, 1);
  assert.notEqual(result.checkpointSha256, projectReserveJournal(before).checkpointSha256);
});

test('genesis append rejects an untrusted or fabricated predecessor checkpoint', () => {
  const before = snapshot([]);
  const after = snapshot([event]);
  assert.throws(() => verifyReserveJournalAppend(before, after, '0'.repeat(64)),
    /predecessor checkpoint mismatch/);
});

test('genesis append cannot silently change valuation policy', () => {
  const before = snapshot([]);
  const after = { ...snapshot([event]), maxEvidenceAgeMs: 172_800_000 };
  assert.throws(() => verifyReserveJournalAppend(before, after,
    projectReserveJournal(before).checkpointSha256), /freshness policy/);
});
