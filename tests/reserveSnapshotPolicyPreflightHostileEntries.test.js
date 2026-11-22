import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

test('rejects invalid snapshot policy before inspecting hostile reserve entries', () => {
  let inspections = 0;
  const entries = new Proxy([], {
    getPrototypeOf() { inspections++; throw new Error('entry traversal'); },
    getOwnPropertyDescriptor() { inspections++; throw new Error('entry traversal'); },
    ownKeys() { inspections++; throw new Error('entry traversal'); },
    get() { inspections++; throw new Error('entry traversal'); },
  });
  const valid = {
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    currency: 'USD', asOfAt: '2026-11-22T00:00:00.000Z',
    maxEvidenceAgeMs: 0, entries,
  };
  for (const [override, error] of [
    [{ currency: 'usd' }, /currency must be a three-letter uppercase code/],
    [{ asOfAt: '2026-11-22' }, /asOfAt must be a canonical UTC ISO timestamp/],
    [{ maxEvidenceAgeMs: -0 }, /maxEvidenceAgeMs must be a nonnegative safe integer/],
    [{ maxEvidenceAgeMs: -1 }, /maxEvidenceAgeMs must be a nonnegative safe integer/],
    [{ maxEvidenceAgeMs: Number.MAX_SAFE_INTEGER + 1 }, /maxEvidenceAgeMs must be a nonnegative safe integer/],
  ]) {
    assert.throws(() => calculateReserveCapacity({ ...valid, ...override }), error);
    assert.equal(inspections, 0, 'invalid policy must not inspect entries');
  }
});
