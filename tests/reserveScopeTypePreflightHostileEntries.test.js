import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

// Reject non-string scope claims before touching untrusted reserve entries.
// Objects with coercion hooks must never be converted into ledger identities.
test('reserve scope type preflight does not coerce identifiers or traverse entries', () => {
  let traversals = 0;
  let coercions = 0;
  const hostileId = {
    toString() { coercions++; throw new Error('identifier coerced'); },
    valueOf() { coercions++; throw new Error('identifier coerced'); },
  };
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
    for (const value of [null, undefined, 0, 1, false, true, 1n, [], hostileId]) {
      assert.throws(
        () => calculateReserveCapacity({ ...base, [field]: value }),
        new RegExp('^TypeError: ' + field + ' must be a nonempty unpadded string$'),
        field + ' must fail type admission before ledger inspection',
      );
      assert.equal(traversals, 0, field + ' traversed untrusted entries');
      assert.equal(coercions, 0, field + ' coerced an untrusted identifier');
    }
  }
});
