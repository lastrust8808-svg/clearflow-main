import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveErpOperationJob } from '../server/services/erpJobReservation.js';

test('aggregate payload traversal fails closed before SQL reservation', async () => {
  let queries = 0;
  const db = { async query() { queries++; throw new Error('SQL must not execute'); } };
  const payload = { rows: Array.from({ length: 201 }, () => Array(100).fill(null)) };
  await assert.rejects(
    reserveErpOperationJob({
      db,
      authenticatedScope: { tenantId: 'tenant-test', actorId: 'actor-test' },
      operation: 'invoice_delivery',
      idempotencyKey: 'aggregate-budget-001',
      payload,
    }),
    /aggregate traversal limit exceeded/,
  );
  assert.equal(queries, 0);
});
