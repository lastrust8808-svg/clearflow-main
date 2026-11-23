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
  // At the accepted limit, validation may proceed to inspect entries.
  assert.throws(
    () => calculateReserveCapacity({ ...base, trustId: 'x'.repeat(1024) }),
    /ledger traversed/,
  );
  assert.equal(traversals, 1);
});
