import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveErpOperationJob } from '../server/services/erpJobReservation.js';

// An unavailable database must never be translated into an in-memory job,
// queued acknowledgement, or success-shaped fallback.
test('ERP reservation propagates storage failure without fallback or retry', async () => {
  const failure = Object.assign(new Error('disposable database unavailable'), { code: 'ECONNREFUSED' });
  let attempts = 0;
  const db = { async query() { attempts++; throw failure; } };
  await assert.rejects(
    reserveErpOperationJob({
      db,
      authenticatedScope: { tenantId: 'tenant-a', actorId: 'actor-a' },
      operation: 'invoice_delivery',
      idempotencyKey: 'storage-failure-001',
      payload: { invoiceId: 'invoice-a', amountCents: 1250 },
    }),
    error => error === failure,
  );
  assert.equal(attempts, 1, 'no implicit retry or process-local fallback');
});

test('ERP replay lookup failure cannot acknowledge an unverified reservation', async () => {
  const failure = new Error('read replica unavailable');
  let attempts = 0;
  const db = { async query() {
    attempts++;
    if (attempts === 1) return { rows: [] }; // ON CONFLICT did not insert
    throw failure; // existing durable record cannot be verified
  } };
  await assert.rejects(
    reserveErpOperationJob({
      db,
      authenticatedScope: { tenantId: 'tenant-a', actorId: 'actor-a' },
      operation: 'invoice_delivery',
      idempotencyKey: 'replay-failure-001',
      payload: { invoiceId: 'invoice-a' },
    }),
    error => error === failure,
  );
  assert.equal(attempts, 2, 'never manufacture a replay receipt');
});
