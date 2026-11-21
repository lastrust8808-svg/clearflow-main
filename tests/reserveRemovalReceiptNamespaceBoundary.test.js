import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-removal-alias', entityId: 'entity-removal-alias', trustId: 'trust-removal-alias' };
const recorded = { ...scope, eventId: 'record-1', type: 'asset_recorded', assetId: 'asset-1',
  evidenceRef: 'proof-1', occurredAt: '2026-11-10T10:00:00.000Z', currency: 'USD',
  kind: 'cash', sourceType: 'bank_balance', amountMinor: 500,
  restrictedMinor: 0, pledgedMinor: 0 };
const removed = { ...scope, eventId: 'remove-1', type: 'asset_removed', assetId: 'asset-1',
  evidenceRef: 'proof-removal', occurredAt: '2026-11-10T10:00:00.001Z' };
const snapshot = events => ({ ...scope, currency: 'USD', asOfAt: '2026-11-10T10:00:00.004Z',
  maxEvidenceAgeMs: 86400000, events });

test('historical removal receipt cannot alias a later event identifier', () => {
  const next = { ...recorded, eventId: removed.evidenceRef, assetId: 'asset-2',
    evidenceRef: 'proof-2', occurredAt: '2026-11-10T10:00:00.002Z' };
  assert.throws(() => projectReserveJournal(snapshot([recorded, removed, next])),
    /identity namespaces must be distinct/);
});

test('checkpoint append rejects removal receipt alias without changing predecessor', () => {
  const previous = snapshot([recorded, removed]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  const next = { ...recorded, eventId: removed.evidenceRef, assetId: 'asset-2',
    evidenceRef: 'proof-2', occurredAt: '2026-11-10T10:00:00.002Z' };
  assert.throws(() => verifyReserveJournalAppend(previous, snapshot([recorded, removed, next]), checkpoint),
    /identity namespaces must be distinct/);
  assert.equal(projectReserveJournal(previous).checkpointSha256, checkpoint);
});

test('distinct removal receipt and subsequent event identifiers remain valid', () => {
  const next = { ...recorded, eventId: 'record-2', assetId: 'asset-2',
    evidenceRef: 'proof-2', occurredAt: '2026-11-10T10:00:00.002Z' };
  const result = verifyReserveJournalAppend(snapshot([recorded, removed]),
    snapshot([recorded, removed, next]), projectReserveJournal(snapshot([recorded, removed])).checkpointSha256);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.removedAssetCount, 1);
});
