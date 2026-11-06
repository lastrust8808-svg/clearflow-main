import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReserveJournal } from '../server/services/reserveJournal.js';

const scope = { tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a' };
const event = { ...scope, eventId: 'event-a', type: 'asset_recorded',
  occurredAt: '2026-11-01T12:00:00.000Z', assetId: 'asset-a', evidenceRef: 'proof-a',
  currency: 'USD', kind: 'cash', sourceType: 'bank_balance', amountMinor: 10000 };
const snapshot = events => ({ ...scope, currency: 'USD',
  asOfAt: '2026-11-02T00:00:00.000Z', maxEvidenceAgeMs: 86_400_000, events });

test('reserve replay and fingerprint use event descriptors, never adversarial event property reads', () => {
  const expected = projectReserveJournal(snapshot([event]));
  let reads = 0;
  const adversarial = new Proxy(event, {
    get(target, key, receiver) {
      if (key === 'amountMinor' || key === 'assetId' || key === 'evidenceRef') {
        reads++;
        return key === 'amountMinor' ? 1 : 'substituted';
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const actual = projectReserveJournal(snapshot([adversarial]));
  assert.equal(reads, 0);
  assert.equal(actual.cashTotalMinor, expected.cashTotalMinor);
  assert.equal(actual.journalSha256, expected.journalSha256);
  assert.equal(actual.checkpointSha256, expected.checkpointSha256);
});
