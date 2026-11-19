import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const snapshot = () => ({
  tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
  currency: 'USD', asOfAt: '2026-11-19T12:00:00.000Z',
  maxEvidenceAgeMs: 86400000, entries: [],
});

test('reserve classification never invokes a caller-supplied array iterator', () => {
  const data = snapshot();
  let iteratorReads = 0;
  data.entries = new Proxy([], {
    get(target, key, receiver) {
      if (key === Symbol.iterator) {
        iteratorReads++;
        throw new Error('untrusted iterator executed');
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const result = calculateReserveCapacity(data);
  assert.equal(result.cashTotalMinor, 0);
  assert.equal(iteratorReads, 0);
});

test('reserve classification uses admitted descriptors instead of indexed proxy gets', () => {
  const data = snapshot();
  const entry = {
    id: 'entry', assetId: 'asset', evidenceRef: 'receipt',
    observedAt: '2026-11-19T12:00:00.000Z',
    tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
    currency: 'USD', kind: 'cash', sourceType: 'bank_balance',
    amountMinor: 100, restrictedMinor: 20, pledgedMinor: 10,
  };
  let indexReads = 0;
  data.entries = new Proxy([entry], {
    get(target, key, receiver) {
      if (key === '0') {
        indexReads++;
        throw new Error('untrusted indexed get executed');
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const result = calculateReserveCapacity(data);
  assert.equal(result.unencumberedCashMinor, 70);
  assert.equal(indexReads, 0);
});
