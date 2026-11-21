import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReserveCapacity } from '../server/services/reserveCapacity.js';

const base = () => ({
  tenantId: 'tenant', entityId: 'entity', trustId: 'trust',
  currency: 'USD', asOfAt: '2026-11-19T12:00:00.000Z',
  maxEvidenceAgeMs: 86400000, entries: [],
});

test('reserve header classification uses the validated first descriptor snapshot', () => {
  const data = base();
  let tenantDescriptors = 0;
  const guarded = new Proxy(data, {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === 'tenantId') {
        tenantDescriptors++;
        return { ...descriptor, value: tenantDescriptors === 1 ? 'tenant' : 'substituted' };
      }
      return descriptor;
    },
  });
  const result = calculateReserveCapacity(guarded);
  assert.equal(result.tenantId, 'tenant');
  assert.equal(tenantDescriptors, 1);
});

test('reserve entry classification uses the validated first descriptor snapshot', () => {
  const data = base();
  const entry = {
    id: 'entry', assetId: 'asset', evidenceRef: 'receipt',
    observedAt: data.asOfAt, tenantId: 'tenant', entityId: 'entity',
    trustId: 'trust', currency: 'USD', kind: 'cash',
    sourceType: 'bank_balance', amountMinor: 100,
    restrictedMinor: 20, pledgedMinor: 10,
  };
  let amountDescriptors = 0;
  data.entries = [new Proxy(entry, {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === 'amountMinor') {
        amountDescriptors++;
        return { ...descriptor, value: amountDescriptors === 1 ? 100 : 999 };
      }
      return descriptor;
    },
  })];
  const result = calculateReserveCapacity(data);
  assert.equal(result.cashTotalMinor, 100);
  assert.equal(result.unencumberedCashMinor, 70);
  assert.equal(amountDescriptors, 1);
});
