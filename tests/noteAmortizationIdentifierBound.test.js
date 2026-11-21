import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixedMonthlyNoteSchedule } from '../server/services/noteAmortization.js';

const base = {
  tenantId: 'tenant-a', entityId: 'entity-a', trustId: 'trust-a',
  noteId: 'note-a', currency: 'USD', principalMinor: 1200,
  annualRateBps: 0, paymentCount: 2, firstDueDate: '2026-01-01',
};

test('note projection rejects oversized and prototype-sensitive ownership identifiers', () => {
  for (const field of ['tenantId', 'entityId', 'trustId', 'noteId']) {
    for (const invalid of ['x'.repeat(1025), '__proto__', 'constructor', 'prototype']) {
      assert.throws(
        () => buildFixedMonthlyNoteSchedule({ ...base, [field]: invalid }),
        /maximum identifier length|prototype-sensitive identifier/,
        field + ': ' + invalid.slice(0, 24),
      );
    }
    const accepted = buildFixedMonthlyNoteSchedule({ ...base, [field]: 'x'.repeat(1024) });
    assert.equal(accepted[field].length, 1024);
    assert.equal(accepted.installments.at(-1).remainingPrincipalMinor, 0);
  }
});
