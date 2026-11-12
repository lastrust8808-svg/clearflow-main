import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

// A removal event remains part of the historical trust audit trail, so its
// evidence identity must not impersonate the trust, tenant, or entity scope.
const scope = { tenantId: 'tenant-removal-scope', entityId: 'entity-removal-scope', trustId: 'trust-removal-scope' };
const recorded = { ...scope, eventId: 'record-1', type: 'asset_recorded',
  assetId: 'asset-1', evidenceRef: 'record-proof', occurredAt: '2026-11-10T10:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 500, restrictedMinor: 0, pledgedMinor: 0 };
const removed = { ...scope, eventId: 'remove-1', type: 'asset_removed',
  assetId: 'asset-1', evidenceRef: 'removal-proof', occurredAt: '2026-11-10T10:00:00.001Z' };
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-10T10:00:00.003Z', maxEvidenceAgeMs: 86400000, events });

test('historical removal evidence cannot impersonate any owner scope identifier', () => {
  for (const evidenceRef of Object.values(scope)) {
    assert.throws(() => projectReserveJournal(snapshot([recorded, { ...removed, evidenceRef }])),
      /identity namespaces must be distinct/);
  }
});

test('scope-impersonating removal evidence cannot advance a checkpointed append', () => {
  const previous = snapshot([recorded]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(previous,
    snapshot([recorded, { ...removed, evidenceRef: scope.trustId }]), checkpoint),
    /identity namespaces must be distinct/);
  assert.equal(projectReserveJournal(previous).checkpointSha256, checkpoint);
});

test('distinct removal evidence is accepted and removed cash stays excluded', () => {
  const previous = snapshot([recorded]);
  const result = verifyReserveJournalAppend(previous, snapshot([recorded, removed]),
    projectReserveJournal(previous).checkpointSha256);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.activeAssetCount, 0);
  assert.equal(result.unencumberedCashMinor, 0);
});
