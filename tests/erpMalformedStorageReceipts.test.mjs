import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveErpOperationJob } from '../server/services/erpJobReservation.js';

// Synthetic database receipts only. No live PostgreSQL or external delivery.
const scope = { tenantId: 'tenant-a', actorId: 'actor-a' };
const args = { authenticatedScope: scope, operation: 'invoice_delivery',
  idempotencyKey: 'receipt-validation-001', payload: { invoiceId: 'inv-a' } };

test('ERP reservation rejects malformed database insert results without replay or success', async () => {
  for (const rows of [undefined, null, {}, [null], [{ status: 'sent' }], [{ status: 'queued', tenant_id: 'tenant-b' }]]) {
    let calls = 0;
    const db = { async query() { calls++; return rows === undefined ? {} : { rows }; } };
    await assert.rejects(reserveErpOperationJob({ ...args, db }));
    assert.equal(calls, 1, 'malformed INSERT receipt must not trigger a fallback lookup');
  }
});

test('ERP reservation rejects malformed replay receipts without retry', async () => {
  for (const rows of [undefined, null, {}, [null], [{ status: 'queued', tenant_id: 'tenant-b' }]]) {
    let calls = 0;
    const db = { async query() {
      calls++;
      return calls === 1 ? { rows: [] } : rows === undefined ? {} : { rows };
    } };
    await assert.rejects(reserveErpOperationJob({ ...args, db }));
    assert.equal(calls, 2, 'one insert and one replay lookup only');
  }
});
