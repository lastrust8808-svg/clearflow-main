import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-removal-proxy', entityId: 'entity-removal-proxy', trustId: 'trust-removal-proxy' };
const recorded = { ...scope, eventId: 'record-1', type: 'asset_recorded',
  assetId: 'asset-1', evidenceRef: 'record-proof', occurredAt: '2026-11-10T10:00:00.000Z',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
  amountMinor: 500, restrictedMinor: 0, pledgedMinor: 0 };
const removed = { ...scope, eventId: 'remove-1', type: 'asset_removed',
  assetId: 'asset-1', evidenceRef: 'remove-proof', occurredAt: '2026-11-10T10:00:00.001Z' };
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-10T10:00:00.003Z', maxEvidenceAgeMs: 86400000, events });

test('historical removal Proxy get trap cannot substitute a different evidence receipt', () => {
  const previous = snapshot([recorded, removed]);
  const checkpoint = projectReserveJournal(previous).checkpointSha256;
  const hostileRemoval = new Proxy({ ...removed, evidenceRef: 'forged-proof' }, {
    get(target, key, receiver) {
      if (key === 'evidenceRef') return removed.evidenceRef;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => verifyReserveJournalAppend(previous,
    snapshot([recorded, hostileRemoval, { ...recorded, eventId: 'record-2',
      assetId: 'asset-2', evidenceRef: 'record-proof-2',
      occurredAt: '2026-11-10T10:00:00.002Z' }]), checkpoint),
  /rewrite historical events/);
  assert.equal(projectReserveJournal(previous).checkpointSha256, checkpoint);
});

test('valid historical removal prefix permits an independently identified new asset', () => {
  const previous = snapshot([recorded, removed]);
  const next = snapshot([recorded, removed, { ...recorded, eventId: 'record-2',
    assetId: 'asset-2', evidenceRef: 'record-proof-2',
    occurredAt: '2026-11-10T10:00:00.002Z' }]);
  const result = verifyReserveJournalAppend(previous, next,
    projectReserveJournal(previous).checkpointSha256);
  assert.equal(result.removedAssetCount, 1);
  assert.equal(result.activeAssetCount, 1);
  assert.equal(result.unencumberedCashMinor, 500);
});
