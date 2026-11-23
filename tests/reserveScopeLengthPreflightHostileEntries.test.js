import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

// Admission must bound each ownership identifier before touching an untrusted
// ledger, including the boundary at exactly 1024 UTF-16 code units.
test('oversized reserve scope identifiers fail before hostile entry traversal', () => {
  let traversals = 0;
  const entries = new Proxy([], {
    getPrototypeOf() { traversals++; throw new Error('ledger traversed'); },
    ownKeys() { traversals++; throw new Error('ledger traversed'); },
    getOwnPropertyDescriptor() { traversals++; throw new Error('ledger traversed'); },
  });
  const base = {
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    currency: 'USD', asOfAt: '2026-11-22T00:00:00.000Z',
    maxEvidenceAgeMs: 0, entries,
  };
  for (const field of ['tenantId', 'entityId', 'trustId']) {
    assert.throws(
      () => calculateReserveCapacity({ ...base, [field]: 'x'.repeat(1025) }),
      /maximum identifier length/,
      field,
    );
    assert.equal(traversals, 0, field + ' must not inspect entries');
  }
  // Every scope role must admit exactly the same 1024-code-unit limit.
  // A supplementary scalar occupies two UTF-16 units, so the boundary must
  // be measured consistently without silently normalizing the identifier.
  for (const field of ['tenantId', 'entityId', 'trustId']) {
    for (const identifier of ['x'.repeat(1024), 'x'.repeat(1022) + '😀']) {
      assert.throws(
        () => calculateReserveCapacity({ ...base, [field]: identifier }),
        /ledger traversed/,
        field + ' must admit the exact boundary before entry validation',
      );
      traversals++;
      assert.equal(traversals, ['tenantId', 'entityId', 'trustId'].indexOf(field) * 2 + (identifier.endsWith('😀') ? 2 : 1));
    }
  }
  // One supplementary scalar beyond the 1024-unit limit must fail before
  // entry traversal, even though the scalar count is smaller.
  const priorTraversals = traversals;
  for (const field of ['tenantId', 'entityId', 'trustId']) {
    assert.throws(
      () => calculateReserveCapacity({ ...base, [field]: 'x'.repeat(1023) + '😀' }),
      /maximum identifier length/,
    );
    assert.equal(traversals, priorTraversals);
  }
});
