import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-safe', entityId: 'entity-safe', trustId: 'trust-safe' };
const recorded = { ...scope, eventId: 'record-safe', type: 'asset_recorded',
  occurredAt: '2026-11-11T10:00:00.000Z', assetId: 'asset-safe',
  evidenceRef: 'evidence-record', currency: 'USD', kind: 'cash',
  sourceType: 'bank_balance', amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0 };
const removed = { ...scope, eventId: 'remove-safe', type: 'asset_removed',
  occurredAt: '2026-11-11T11:00:00.000Z', assetId: 'asset-safe',
  evidenceRef: 'evidence-remove' };
const snapshot = (events = [recorded, removed]) => ({
  ...scope, currency: 'USD', asOfAt: '2026-11-11T12:00:00.000Z',
  maxEvidenceAgeMs: 86_400_000, events
});

test('removed-only event identifiers reject prototype-sensitive bare values', () => {
  for (const value of ['__proto__', 'constructor', 'prototype']) {
    assert.throws(() => projectReserveJournal(snapshot([
      recorded, { ...removed, eventId: value }
    ])), /prototype-sensitive identifier/);
  }
});

test('removed-only evidence references reject prototype-sensitive bare values', () => {
  for (const value of ['__proto__', 'constructor', 'prototype']) {
    assert.throws(() => projectReserveJournal(snapshot([
      recorded, { ...removed, evidenceRef: value }
    ])), /prototype-sensitive identifier/);
  }
});

test('prefixed identifiers remain valid and removal still leaves no active asset', () => {
  const result = projectReserveJournal(snapshot([
    recorded, { ...removed, eventId: 'record:constructor', evidenceRef: 'evidence:prototype' }
  ]));
  assert.equal(result.activeAssetCount, 0);
  assert.equal(result.removedAssetCount, 1);
});
