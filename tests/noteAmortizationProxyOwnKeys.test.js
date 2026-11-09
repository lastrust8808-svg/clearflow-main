import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixedMonthlyNoteSchedule } from '../server/services/noteAmortization.js';

const valid = Object.freeze({
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  noteId: 'note-a', currency: 'USD', principalMinor: 120000,
  annualRateBps: 600, paymentCount: 12, firstDueDate: '2026-01-31',
});

test('note projection fails closed when Proxy denies enumeration without reading terms', () => {
  let reads = 0;
  const input = new Proxy({ ...valid }, {
    ownKeys() { throw new Error('enumeration denied'); },
    get() { reads++; throw new Error('untrusted read'); },
  });
  assert.throws(() => buildFixedMonthlyNoteSchedule(input), /enumeration denied/);
  assert.equal(reads, 0);
});

test('note projection rejects injected execution metadata exposed through Proxy keys', () => {
  let reads = 0;
  const input = new Proxy({ ...valid, executed: true }, {
    get() { reads++; throw new Error('untrusted read'); },
  });
  assert.throws(() => buildFixedMonthlyNoteSchedule(input), /Unsupported note terms field/);
  assert.equal(reads, 0);
});
