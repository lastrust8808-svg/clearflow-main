import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixedMonthlyNoteSchedule } from '../server/services/noteAmortization.js';

const valid = {
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  noteId: 'note-a', currency: 'USD', principalMinor: 120000,
  annualRateBps: 600, paymentCount: 12, firstDueDate: '2026-01-31',
};

test('private-note term inspection fails closed when a hostile Proxy cannot enumerate own keys', () => {
  let getterReads = 0;
  const input = new Proxy({ ...valid }, {
    ownKeys() { throw new Error('term enumeration denied'); },
    get(_target, key) {
      getterReads++;
      throw new Error('unexpected term read: ' + String(key));
    },
  });
  assert.throws(() => buildFixedMonthlyNoteSchedule(input), /term enumeration denied/);
  assert.equal(getterReads, 0);
});

test('private-note term inspection fails closed on inconsistent Proxy property descriptors', () => {
  let getterReads = 0;
  const input = new Proxy({ ...valid }, {
    getOwnPropertyDescriptor(target, key) {
      if (key === 'principalMinor') throw new Error('descriptor unavailable');
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    get(_target, key) {
      getterReads++;
      throw new Error('unexpected term read: ' + String(key));
    },
  });
  assert.throws(() => buildFixedMonthlyNoteSchedule(input), /descriptor unavailable/);
  assert.equal(getterReads, 0);
  const projected = buildFixedMonthlyNoteSchedule({ ...valid });
  assert.equal(projected.installments.at(-1).remainingPrincipalMinor, 0);
  assert.equal(Object.hasOwn(projected, 'settled'), false);
});
