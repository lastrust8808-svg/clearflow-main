import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveErpOperationJob } from '../server/services/erpJobReservation.js';

const args = {
  authenticatedScope: { tenantId: 'tenant-a', actorId: 'actor-a' },
  operation: 'invoice_delivery',
  idempotencyKey: 'unsafe-receipt-001',
  payload: { invoiceId: 'inv-a' },
};

test('ERP rejects proxy and accessor-backed database receipts without fallback', async () => {
  const row = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    tenant_id: 'tenant-a', actor_id: 'actor-a',
    operation: 'invoice_delivery', idempotency_key: 'unsafe-receipt-001',
    payload_sha256: 'not-a-real-digest', status: 'queued',
    created_at: '2026-01-01T00:00:00Z',
  };
  const accessor = { ...row };
  Object.defineProperty(accessor, 'tenant_id', { enumerable: true, get() {
    throw new Error('Getter must never run');
  } });
  for (const unsafe of [new Proxy(row, {}), accessor, Object.assign(Object.create({ inherited: true }), row)]) {
    let calls = 0;
    const db = { async query() { calls++; return { rows: [unsafe] }; } };
    await assert.rejects(reserveErpOperationJob({ ...args, db }), /unsafe reservation/);
    assert.equal(calls, 1);
  }
});

test('ERP rejects unexpected, hidden and symbol-backed reservation columns before acknowledgement', async () => {
  const row = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    tenant_id: 'tenant-a', actor_id: 'actor-a',
    operation: 'invoice_delivery', idempotency_key: 'unsafe-receipt-001',
    payload_sha256: 'not-a-real-digest', status: 'queued',
    created_at: '2026-01-01T00:00:00Z',
  };
  const extra = { ...row, delivered: true };
  const hidden = { ...row };
  Object.defineProperty(hidden, 'delivered', { value: true, enumerable: false });
  const symbol = { ...row, [Symbol('delivered')]: true };
  const nonenumerable = { ...row };
  Object.defineProperty(nonenumerable, 'status', { value: 'queued', enumerable: false });
  for (const unsafe of [extra, hidden, symbol, nonenumerable]) {
    let calls = 0;
    const db = { async query() { calls++; return { rows: [unsafe] }; } };
    await assert.rejects(reserveErpOperationJob({ ...args, db }), /unsafe reservation/);
    assert.equal(calls, 1, 'must not attempt fallback lookup');
  }
});
