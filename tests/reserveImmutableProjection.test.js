import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const scope = Object.freeze({
  tenantId: 'tenant-immutable', entityId: 'entity-immutable',
  trustId: 'trust-immutable', currency: 'USD',
});
const entry = (id, amountMinor) => ({
  ...scope, id, assetId: `asset-${id}`, evidenceRef: `evidence-${id}`,
  observedAt: '2026-11-11T00:00:00.000Z',
  kind: 'cash', sourceType: 'bank_balance',
  amountMinor, restrictedMinor: 0, pledgedMinor: 0,
});
const snapshot = entries => ({
  ...scope, asOfAt: '2026-11-11T00:00:00.000Z',
  maxEvidenceAgeMs: 0, entries,
});

test('reserve classification does not mutate frozen source records', () => {
  const first = Object.freeze(entry('first', 125));
  const second = Object.freeze(entry('second', 75));
  const entries = Object.freeze([first, second]);
  const input = Object.freeze(snapshot(entries));
  const result = calculateReserveCapacity(input);
  assert.equal(result.cashTotalMinor, 200);
  assert.equal(result.unencumberedCashMinor, 200);
  assert.equal(entries.length, 2);
  assert.equal(first.amountMinor, 125);
});

test('reserve result is frozen to prevent downstream silent total edits', () => {
  const result = calculateReserveCapacity(snapshot([entry('one', 50)]));
  assert.equal(Object.isFrozen(result), true);
  assert.throws(() => { result.unencumberedCashMinor = 5000; }, TypeError);
  assert.equal(result.unencumberedCashMinor, 50);
});

test('classification is independent of the ordering of distinct reserve entries', () => {
  const first = entry('first', 100);
  first.restrictedMinor = 40;
  const second = entry('second', 200);
  second.pledgedMinor = 75;
  const forward = calculateReserveCapacity(snapshot([first, second]));
  const reverse = calculateReserveCapacity(snapshot([second, first]));
  assert.deepEqual(forward, reverse);
  assert.equal(forward.unencumberedCashMinor, 185);
});
