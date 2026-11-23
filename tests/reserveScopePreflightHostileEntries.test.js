import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

test('rejects aliased reserve ownership scopes before inspecting hostile entry collections', () => {
  let inspected = 0;
  const entries = new Proxy([], {
    getPrototypeOf() { inspected++; throw new Error('entries inspected'); },
    getOwnPropertyDescriptor() { inspected++; throw new Error('entries inspected'); },
    ownKeys() { inspected++; throw new Error('entries inspected'); },
    get() { inspected++; throw new Error('entries inspected'); },
  });
  for (const scope of [
    { tenantId: 'same', entityId: 'same', trustId: 'trust' },
    { tenantId: 'tenant', entityId: 'same', trustId: 'same' },
    { tenantId: 'same', entityId: 'entity', trustId: 'same' },
  ]) {
    assert.throws(() => calculateReserveCapacity({
      ...scope, currency: 'USD', asOfAt: '2026-11-22T00:00:00.000Z',
      maxEvidenceAgeMs: 0, entries,
    }), /identifiers must be distinct/);
    assert.equal(inspected, 0, 'invalid ownership scope must not traverse asset records');
  }
});
