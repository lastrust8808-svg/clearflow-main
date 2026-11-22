import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

// An invalid storage identity must fail before the classifier touches an
// untrusted ledger collection. This is structural admission, not authorization.
test('rejects noncanonical reserve scope identifiers before entry traversal', () => {
  let inspected = 0;
  const entries = new Proxy([], {
    getPrototypeOf() { inspected++; throw new Error('unexpected ledger traversal'); },
    ownKeys() { inspected++; throw new Error('unexpected ledger traversal'); },
    getOwnPropertyDescriptor() { inspected++; throw new Error('unexpected ledger traversal'); },
  });
  const valid = {
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    currency: 'USD', asOfAt: '2026-11-22T00:00:00.000Z',
    maxEvidenceAgeMs: 0, entries,
  };
  for (const [field, value] of [
    ['tenantId', '__proto__'],
    ['entityId', 'entity\\u0000alias'],
    ['trustId', 'trust\\u200Balias'],
    ['trustId', 'trust\\uFDD0'],
    ['entityId', 'e\\u0301ntity'],
    ['tenantId', 'tenant '],
    ['trustId', 'trust\\uD800'],
  ]) {
    assert.throws(() => calculateReserveCapacity({ ...valid, [field]: value }),
      /identifier|control|invisible|noncharacters|NFC|Unicode|unpadded/i,
      field + ' must fail scope admission');
    assert.equal(inspected, 0, field + ' must not traverse entries');
  }
});
