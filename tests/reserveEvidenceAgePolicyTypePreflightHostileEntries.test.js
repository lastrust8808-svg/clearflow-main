import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

// Evidence freshness policy is trusted server input. Reject hostile numeric
// claims before reading any caller-supplied reserve entry collection.
test('reserve evidence age policy rejects non-integer and coercible claims before ledger traversal', () => {
  let traversals = 0;
  let coercions = 0;
  const hostile = {
    valueOf() { coercions++; throw new Error('coerced policy'); },
    toString() { coercions++; throw new Error('coerced policy'); },
  };
  const entries = new Proxy([], {
    getPrototypeOf() { traversals++; throw new Error('traversed entries'); },
    ownKeys() { traversals++; throw new Error('traversed entries'); },
    getOwnPropertyDescriptor() { traversals++; throw new Error('traversed entries'); },
  });
  const base = {
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    currency: 'USD', asOfAt: '2026-11-22T00:00:00.000Z',
    entries,
  };
  for (const value of [-0, -1, 0.5, NaN, Infinity, -Infinity,
    Number.MAX_SAFE_INTEGER + 1, '0', null, undefined, 0n,
    Symbol('age'), hostile]) {
    assert.throws(
      () => calculateReserveCapacity({ ...base, maxEvidenceAgeMs: value }),
      /RangeError: maxEvidenceAgeMs must be a nonnegative safe integer/,
    );
    assert.equal(traversals, 0, 'invalid evidence age traversed entries');
    assert.equal(coercions, 0, 'invalid evidence age coerced policy');
  }
});
