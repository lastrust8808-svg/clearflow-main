import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reserveErpOperationJob as reserve } from '../server/services/erpJobReservation.js';

const scope = { tenantId: 'tenant-a', actorId: 'actor-a' };
const args = { authenticatedScope: scope, operation: 'invoice_delivery',
  idempotencyKey: 'invoice-123-send', payload: { invoiceId: 'invoice-123', entityId: 'entity-a' } };

function fakeDatabase() {
  const rows = new Map();
  let calls = 0;
  return {
    rows,
    get calls() { return calls; },
    async query(sql, params) {
      calls++;
      const [tenantId, actorIdOrOperation, operationOrKey, key] = params;
      if (/INSERT INTO erp_operation_jobs/.test(sql)) {
        const id = [tenantId, operationOrKey, key].join('|');
        if (rows.has(id)) return { rows: [] };
        const row = {
          id: 'job-' + (rows.size + 1), tenant_id: tenantId,
          actor_id: actorIdOrOperation, operation: operationOrKey,
          idempotency_key: key, payload_sha256: params[4],
          status: 'queued', created_at: new Date('2026-10-29T12:00:00Z'),
        };
        rows.set(id, row);
        return { rows: [row] };
      }
      if (/FROM erp_operation_jobs/.test(sql)) {
        return { rows: [rows.get(params.join('|'))].filter(Boolean) };
      }
      throw new Error('Unexpected SQL');
    },
  };
}

test('proposed schema uses a tenant+operation+idempotency unique constraint', () => {
  const sql = readFileSync(new URL('../server/db/erp_operation_jobs.proposed.sql', import.meta.url), 'utf8');
  assert.match(sql, /UNIQUE\s*\(tenant_id, operation, idempotency_key\)/);
  assert.match(sql, /payload\s+jsonb\s+NOT NULL/i);
  assert.match(sql, /actor_id\s+text\s+NOT NULL/i);
});

test('first reservation is recorded, identical replay returns the original job', async () => {
  const db = fakeDatabase();
  const first = await reserve({ db, ...args });
  const second = await reserve({ db, ...args });
  assert.equal(first.created, true);
  assert.equal(first.replayed, false);
  assert.equal(second.created, false);
  assert.equal(second.replayed, true);
  assert.equal(first.id, second.id);
  assert.equal(db.rows.size, 1);
  assert.equal(db.calls, 3);
});

test('same idempotency key with different payload or actor fails closed', async () => {
  const db = fakeDatabase();
  await reserve({ db, ...args });
  await assert.rejects(reserve({ db, ...args, payload: { invoiceId: 'other' } }),
    { code: 'ERP_IDEMPOTENCY_CONFLICT' });
  await assert.rejects(reserve({ db, ...args, authenticatedScope: { ...scope, actorId: 'actor-b' } }),
    { code: 'ERP_IDEMPOTENCY_CONFLICT' });
  assert.equal(db.rows.size, 1);
});

test('tenant boundaries and operation boundaries do not collide', async () => {
  const db = fakeDatabase();
  const a = await reserve({ db, ...args });
  const b = await reserve({ db, ...args, authenticatedScope: { tenantId: 'tenant-b', actorId: 'actor-b' } });
  const c = await reserve({ db, ...args, operation: 'invoice_export' });
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.id, c.id);
  assert.equal(db.rows.size, 3);
});

test('rejects unauthenticated, invalid and oversized requests before querying', async () => {
  const db = fakeDatabase();
  for (const invalid of [
    { authenticatedScope: null },
    { authenticatedScope: { tenantId: 'tenant-a' } },
    { operation: 'settlement_execution' },
    { idempotencyKey: 'x' },
    { payload: [] },
    { payload: { body: 'x'.repeat(66000) } },
  ]) {
    await assert.rejects(reserve({ db, ...args, ...invalid }));
  }
  assert.equal(db.calls, 0);
});

test('database errors and missing/conflicting receipts never return success', async () => {
  const broken = { query: async () => { throw new Error('database offline'); } };
  await assert.rejects(reserve({ db: broken, ...args }), /database offline/);
  const missing = { query: async (sql) => ({ rows: /INSERT/.test(sql) ? [] : [] }) };
  await assert.rejects(reserve({ db: missing, ...args }), /could not be verified/);
  const wrong = { query: async () => ({ rows: [{
    id: 'job-1', tenant_id: 'other-tenant', actor_id: scope.actorId,
    operation: args.operation, idempotency_key: args.idempotencyKey,
    payload_sha256: 'a'.repeat(64), status: 'queued', created_at: new Date(),
  }] }) };
  await assert.rejects(reserve({ db: wrong, ...args }), /invalid tenant-bound receipt/);
});
