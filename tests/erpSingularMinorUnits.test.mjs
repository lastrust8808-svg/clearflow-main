import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveErpOperationJob } from '../server/services/erpJobReservation.js';

const scope = { tenantId: 'tenant-a', actorId: 'actor-a' };
const base = { authenticatedScope: scope, operation: 'invoice_delivery', idempotencyKey: 'singular-unit-001' };

test('singular camelCase financial minor-unit fields reject ambiguous values before SQL', async () => {
  for (const key of ['amountCent', 'amountMinorUnit', 'totalCent', 'balanceMinorUnit']) {
    for (const value of [1.5, '150', null, false, -0, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      let calls = 0;
      const db = { query() { calls++; throw Error('SQL must not execute'); } };
      await assert.rejects(
        reserveErpOperationJob({ db, ...base, payload: { invoiceId: 'invoice-a', lines: [{ [key]: value }] } }),
        /invalid minor-unit amount|negative zero|non-finite|unsafe integer/,
        key + ': ' + String(value),
      );
      assert.equal(calls, 0, key + ' must fail before SQL');
    }
  }
});
