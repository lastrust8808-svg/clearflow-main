import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixedMonthlyNoteSchedule } from '../server/services/noteAmortization.js';

const terms = Object.freeze({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  noteId: 'note-a', currency: 'USD', principalMinor: 120000,
  annualRateBps: 600, paymentCount: 12, firstDueDate: '2026-01-31',
});

test('note projection fails closed when a Proxy refuses descriptor inspection', () => {
  for (const blockedKey of ['principalMinor', 'noteId']) {
    let reads = 0;
    const input = new Proxy({ ...terms }, {
      get(_target, key) {
        reads++;
        throw new Error('untrusted getter: ' + String(key));
      },
      getOwnPropertyDescriptor(target, key) {
        if (key === blockedKey) throw new Error('descriptor denied');
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    assert.throws(() => buildFixedMonthlyNoteSchedule(input), /descriptor denied/);
    assert.equal(reads, 0, 'untrusted property reads must never execute');
  }
});

test('note projection does not invoke accessor values returned by Proxy descriptors', () => {
  let reads = 0;
  const input = new Proxy({ ...terms }, {
    get() { reads++; throw new Error('untrusted property read'); },
    getOwnPropertyDescriptor(target, key) {
      if (key === 'principalMinor') {
        return { configurable: true, enumerable: true, get() {
          reads++;
          throw new Error('untrusted accessor');
        } };
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.throws(() => buildFixedMonthlyNoteSchedule(input), /enumerable data properties/);
  assert.equal(reads, 0);
});

test('note projection fails closed when Proxy key enumeration is denied', () => {
  let reads = 0;
  const input = new Proxy({ ...terms }, {
    ownKeys() { throw new Error('enumeration denied'); },
    get() { reads++; throw new Error('untrusted property read'); },
  });
  assert.throws(() => buildFixedMonthlyNoteSchedule(input), /enumeration denied/);
  assert.equal(reads, 0, 'untrusted property reads must never execute');
});
