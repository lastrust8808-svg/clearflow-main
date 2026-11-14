import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal, verifyReserveJournalAppend } from '../server/services/reserveJournal.js';

// The checkpoint is a policy-bound preflight value, not an authorization token.
const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a' };
const event = { ...scope, eventId: 'event-a', type: 'asset_recorded',
  occurredAt: '2026-11-11T10:00:00.000Z', assetId: 'asset-a',
  evidenceRef: 'evidence-a', currency: 'USD', kind: 'cash',
  sourceType: 'bank_balance', amountMinor: 1000, restrictedMinor: 0, pledgedMinor: 0 };
const snapshot = () => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-11T12:00:00.000Z', maxEvidenceAgeMs: 86_400_000,
  events: [{ ...event }] });
const extension = () => ({ ...snapshot(), events: [{ ...event }, {
  ...event, eventId: 'event-b', assetId: 'asset-b', evidenceRef: 'evidence-b',
  occurredAt: '2026-11-11T11:00:00.000Z' }] });

test('append rejects a predecessor checkpoint bound to a different as-of time', () => {
  const before = snapshot();
  const trusted = projectReserveJournal(before).checkpointSha256;
  const altered = snapshot();
  altered.asOfAt = '2026-11-11T12:01:00.000Z';
  assert.notEqual(projectReserveJournal(altered).checkpointSha256, trusted);
  assert.throws(() => verifyReserveJournalAppend(altered, extension(), trusted),
    /predecessor checkpoint mismatch/);
});

test('append rejects a predecessor checkpoint bound to a different evidence freshness policy', () => {
  const before = snapshot();
  const trusted = projectReserveJournal(before).checkpointSha256;
  const altered = snapshot();
  altered.maxEvidenceAgeMs = 86_400_001;
  assert.notEqual(projectReserveJournal(altered).checkpointSha256, trusted);
  assert.throws(() => verifyReserveJournalAppend(altered, extension(), trusted),
    /predecessor checkpoint mismatch/);
});

test('append rejects freshness-policy widening even with a matching predecessor checkpoint', () => {
  const before = snapshot();
  const after = extension();
  after.maxEvidenceAgeMs++;
  const trusted = projectReserveJournal(before).checkpointSha256;
  assert.throws(() => verifyReserveJournalAppend(before, after, trusted),
    /cannot change evidence freshness policy/);
});
