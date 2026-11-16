import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveErpOperationJob } from '../server/services/erpJobReservation.js';

test('aggregate ERP string budget rejects oversized financial payload before SQL', async () => {
  let queries = 0;
  const db = { query() { queries++; throw Error('SQL must not execute'); } };
  const payload = { invoiceId: 'invoice-a', lines: Array.from({ length: 80 }, (_, i) => ({
    item: String(i), description: 'x'.repeat(900),
  })) };
  await assert.rejects(
    reserveErpOperationJob({
      db, authenticatedScope: { tenantId: 'tenant-a', actorId: 'actor-a' },
      operation: 'invoice_delivery', idempotencyKey: 'aggregate-text-001', payload,
    }),
    /aggregate string length limit exceeded/,
  );
  assert.equal(queries, 0);
});
