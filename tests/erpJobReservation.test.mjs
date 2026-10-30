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

test('reservation rejects lossy JSON payload values before any database write', async () => {
  const db = fakeDatabase();
  const sparse = []; sparse[1] = 'value';
  const extra = ['item']; extra.note = 'ignored by JSON.stringify';
  const withSymbol = { invoiceId: 'invoice-123', [Symbol('hidden')]: 'value' };
  const cyclic = { invoiceId: 'invoice-123' }; cyclic.self = cyclic;
  const bad = [
    { amount: NaN }, { amount: Infinity }, { amount: -Infinity },
    { recipient: undefined }, { recipient: () => 'test' },
    { recipient: Symbol('secret') }, { lines: [1, undefined] },
    { lines: sparse }, { lines: extra }, withSymbol, cyclic,
    { issuedAt: new Date('2026-10-30T00:00:00Z') },
    { toJSON: () => ({ invoiceId: 'different' }) },
  ];
  for (const payload of bad) {
    await assert.rejects(reserve({ db, ...args, payload }), /ERP job payload/);
  }
  assert.equal(db.calls, 0);
});

test('reservation rejects accessors without invoking them', async () => {
  const db = fakeDatabase();
  let invoked = 0;
  const payload = { invoiceId: 'invoice-123' };
  Object.defineProperty(payload, 'recipient', { enumerable: true, get() {
    invoked++; throw new Error('getter must never execute');
  } });
  await assert.rejects(reserve({ db, ...args, payload }), /ERP job payload/);
  assert.equal(invoked, 0);
  assert.equal(db.calls, 0);
});

test('reservation rejects hidden object fields before hashing or storing an ERP job', async () => {
  const db = fakeDatabase();
  const hiddenRecipient = { invoiceId: 'invoice-123' };
  Object.defineProperty(hiddenRecipient, 'recipient', {
    value: 'member@example.test', enumerable: false,
  });
  const hiddenNestedAmount = { invoiceId: 'invoice-123', line: { description: 'work' } };
  Object.defineProperty(hiddenNestedAmount.line, 'amount', {
    value: 125, enumerable: false,
  });
  let getterCalls = 0;
  const hiddenGetter = { invoiceId: 'invoice-123' };
  Object.defineProperty(hiddenGetter, 'recipient', {
    enumerable: false, get() { getterCalls++; throw new Error('must not execute'); },
  });
  for (const payload of [hiddenRecipient, hiddenNestedAmount, hiddenGetter]) {
    await assert.rejects(reserve({ db, ...args, payload }), /ERP job payload/);
  }
  assert.equal(getterCalls, 0);
  assert.equal(db.calls, 0);
});

test('reservation accepts explicit finite JSON amounts and dense line arrays', async () => {
  const db = fakeDatabase();
  const payload = { invoiceId: 'invoice-123', amount: 123.45,
    lines: [{ description: 'service', quantity: 2, unitPrice: 61.725 }] };
  const first = await reserve({ db, ...args, payload });
  const replay = await reserve({ db, ...args, payload });
  assert.equal(first.created, true);
  assert.equal(replay.replayed, true);
  assert.equal(first.id, replay.id);
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

const statusJobId = '123e4567-e89b-42d3-a456-426614174000';

test('status lookup is tenant-and-actor scoped and returns persisted status only', async () => {
  const { readErpOperationJobStatus } = await import('../server/services/erpJobReservation.js');
  const calls = [];
  const db = { async query(sql, params) {
    calls.push({ sql, params });
    return { rows: [{
      id: statusJobId, tenant_id: scope.tenantId, actor_id: scope.actorId,
      operation: 'invoice_delivery', status: 'queued',
      created_at: new Date('2026-10-29T12:00:00Z'),
      updated_at: new Date('2026-10-29T12:01:00Z'),
    }] };
  } };
  const result = await readErpOperationJobStatus({
    db, authenticatedScope: scope, jobId: statusJobId,
  });
  assert.deepEqual(calls[0].params, [scope.tenantId, scope.actorId, statusJobId]);
  assert.match(calls[0].sql, /WHERE tenant_id = \$1 AND actor_id = \$2 AND id = \$3/);
  assert.equal(result.status, 'queued');
  assert.equal(result.id, statusJobId);
  assert.equal(Object.isFrozen(result), true);
  assert.equal('delivered' in result, false);
});

test('status lookup fails closed on missing scope, invalid ids, malformed or foreign records', async () => {
  const { readErpOperationJobStatus } = await import('../server/services/erpJobReservation.js');
  let calls = 0;
  const db = { async query() { calls++; return { rows: [] }; } };
  for (const invalid of [
    { authenticatedScope: null },
    { authenticatedScope: { tenantId: scope.tenantId } },
    { jobId: 'not-a-uuid' },
  ]) {
    await assert.rejects(readErpOperationJobStatus({
      db, authenticatedScope: scope, jobId: statusJobId, ...invalid,
    }));
  }
  assert.equal(calls, 0);
  assert.equal(await readErpOperationJobStatus({
    db, authenticatedScope: scope, jobId: statusJobId,
  }), null);
  const base = {
    id: statusJobId, tenant_id: scope.tenantId, actor_id: scope.actorId,
    operation: 'invoice_delivery', status: 'queued',
    created_at: new Date('2026-10-29T12:00:00Z'),
    updated_at: new Date('2026-10-29T12:01:00Z'),
  };
  for (const record of [
    { ...base, tenant_id: 'other-tenant' },
    { ...base, actor_id: 'other-actor' },
    { ...base, id: '123e4567-e89b-42d3-a456-426614174001' },
    { ...base, status: 'delivered' },
    { ...base, updated_at: 'not-a-date' },
  ]) {
    const wrongDb = { query: async () => ({ rows: [record] }) };
    await assert.rejects(readErpOperationJobStatus({
      db: wrongDb, authenticatedScope: scope, jobId: statusJobId,
    }), /invalid/);
  }
  await assert.rejects(readErpOperationJobStatus({
    db: { query: async () => { throw new Error('database offline'); } },
    authenticatedScope: scope, jobId: statusJobId,
  }), /database offline/);
  await assert.rejects(readErpOperationJobStatus({
    db: { query: async () => ({ rows: [{ ...base }, { ...base }] }) },
    authenticatedScope: scope, jobId: statusJobId,
  }), /invalid status result/);
});


const workerScope = { tenantId: 'tenant-a', workerId: 'worker-a' };
const claimedJobId = '123e4567-e89b-42d3-a456-426614174000';
function claimedRow(overrides = {}) {
  return {
    id: claimedJobId, tenant_id: workerScope.tenantId,
    actor_id: 'actor-a', operation: 'invoice_delivery',
    status: 'processing', claimed_by: workerScope.workerId,
    claimed_at: new Date('2026-10-29T12:01:00Z'),
    lease_expires_at: new Date('2026-10-29T12:02:00Z'),
    created_at: new Date('2026-10-29T12:00:00Z'),
    updated_at: new Date('2026-10-29T12:01:00Z'),
    ...overrides,
  };
}

test('atomic worker claim is tenant-scoped, queued-only and locked across workers', async () => {
  const { claimErpOperationJob } = await import('../server/services/erpJobReservation.js');
  let captured;
  const db = { async query(sql, params) {
    captured = { sql, params };
    return { rows: [claimedRow()] };
  } };
  const result = await claimErpOperationJob({
    db, authenticatedWorker: workerScope, operation: 'invoice_delivery',
  });
  assert.deepEqual(captured.params, ['tenant-a', 'invoice_delivery', 'worker-a', 60]);
  assert.match(captured.sql, /FOR UPDATE SKIP LOCKED LIMIT 1/);
  assert.match(captured.sql, /WHERE tenant_id = \$1 AND operation = \$2 AND status = 'queued'/);
  assert.match(captured.sql, /job\.status = 'queued'/);
  assert.match(captured.sql, /SET status = 'processing'/);
  assert.equal(result.id, claimedJobId);
  assert.equal(result.claimedBy, 'worker-a');
  assert.equal(result.leaseExpiresAt, '2026-10-29T12:02:00.000Z');
  assert.equal(Object.isFrozen(result), true);
  assert.equal('delivered' in result, false);
});

test('no queued job returns null; storage errors are never successful claims', async () => {
  const { claimErpOperationJob } = await import('../server/services/erpJobReservation.js');
  const args = { authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  assert.equal(await claimErpOperationJob({
    ...args, db: { query: async () => ({ rows: [] }) },
  }), null);
  await assert.rejects(claimErpOperationJob({
    ...args, db: { query: async () => { throw new Error('database offline'); } },
  }), /database offline/);
  await assert.rejects(claimErpOperationJob({
    ...args, db: { query: async () => ({ rows: [claimedRow(), claimedRow()] }) },
  }), /invalid worker claim/);
});

test('worker claims reject missing identity, invalid operations and leases before DB access', async () => {
  const { claimErpOperationJob } = await import('../server/services/erpJobReservation.js');
  let calls = 0;
  const db = { query: async () => { calls++; return { rows: [] }; } };
  const args = { db, authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  for (const invalid of [
    { authenticatedWorker: null },
    { authenticatedWorker: { tenantId: 'tenant-a' } },
    { operation: 'settlement_execution' },
    { leaseSeconds: 0 }, { leaseSeconds: 301 }, { leaseSeconds: 1.5 },
  ]) {
    await assert.rejects(claimErpOperationJob({ ...args, ...invalid }));
  }
  assert.equal(calls, 0);
});

test('worker claims reject foreign or fabricated records and invalid leases', async () => {
  const { claimErpOperationJob } = await import('../server/services/erpJobReservation.js');
  const args = { authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  for (const row of [
    claimedRow({ tenant_id: 'tenant-b' }),
    claimedRow({ claimed_by: 'worker-b' }),
    claimedRow({ status: 'sent' }),
    claimedRow({ id: 'fake-job' }),
    claimedRow({ actor_id: '' }),
    claimedRow({ lease_expires_at: new Date('2026-10-29T12:01:00Z') }),
    claimedRow({ lease_expires_at: 'invalid' }),
    claimedRow({ updated_at: new Date('2026-10-29T11:00:00Z') }),
  ]) {
    await assert.rejects(claimErpOperationJob({
      ...args, db: { query: async () => ({ rows: [row] }) },
    }), /invalid/);
  }
});

test('proposed schema requires durable claim ownership and indexes queued work', () => {
  const sql = readFileSync(new URL('../server/db/erp_operation_jobs.proposed.sql', import.meta.url), 'utf8');
  assert.match(sql, /claimed_by text/);
  assert.match(sql, /lease_expires_at timestamptz/);
  assert.match(sql, /CONSTRAINT erp_worker_claim_consistency CHECK/);
  assert.match(sql, /WHERE status = 'queued'/);
});

test('lease renewal is atomic and limited to the owning worker and unexpired processing job', async () => {
  const { renewErpOperationJobLease: renew } = await import('../server/services/erpJobReservation.js');
  let query;
  const db = { async query(sql, params) {
    query = { sql, params };
    return { rows: [claimedRow({ lease_expires_at: new Date('2026-10-29T12:04:00Z') })] };
  } };
  const result = await renew({ db, authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: claimedJobId });
  assert.deepEqual(query.params, ['tenant-a', 'invoice_delivery', claimedJobId, 'worker-a', 60]);
  assert.match(query.sql, /claimed_by = \$4 AND status = 'processing'/);
  assert.match(query.sql, /lease_expires_at > now\(\)/);
  assert.match(query.sql, /UPDATE erp_operation_jobs/);
  assert.match(query.sql, /GREATEST/); // renewing early must never shorten an existing lease
  assert.equal(result.leaseExpiresAt, '2026-10-29T12:04:00.000Z');
  assert.equal(result.status, 'processing');
  assert.equal(Object.isFrozen(result), true);
  assert.equal('delivered' in result, false);
});

test('expired, finished or foreign leases cannot be renewed; database failure is not success', async () => {
  const { renewErpOperationJobLease: renew } = await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope, operation: 'invoice_delivery', jobId: claimedJobId };
  assert.equal(await renew({ ...input, db: { query: async () => ({ rows: [] }) } }), null);
  await assert.rejects(renew({ ...input,
    db: { query: async () => { throw new Error('database offline'); } },
  }), /database offline/);
  await assert.rejects(renew({ ...input,
    db: { query: async () => ({ rows: [claimedRow(), claimedRow()] }) },
  }), /invalid lease renewal result/);
  for (const row of [
    claimedRow({ tenant_id: 'other' }), claimedRow({ claimed_by: 'other' }),
    claimedRow({ status: 'sent' }), claimedRow({ id: 'other' }),
    claimedRow({ lease_expires_at: new Date('2026-10-29T12:01:00Z') }),
    claimedRow({ updated_at: 'not-a-date' }),
  ]) await assert.rejects(renew({
    ...input, db: { query: async () => ({ rows: [row] }) },
  }), /invalid/);
});

test('lease renewal rejects missing identities, invalid operations, IDs and bounds before DB access', async () => {
  const { renewErpOperationJobLease: renew } = await import('../server/services/erpJobReservation.js');
  let calls = 0;
  const db = { query: async () => { calls++; return { rows: [] }; } };
  const input = { db, authenticatedWorker: workerScope, operation: 'invoice_delivery', jobId: claimedJobId };
  for (const invalid of [
    { authenticatedWorker: null },
    { authenticatedWorker: { tenantId: 'tenant-a' } },
    { operation: 'settlement_execution' }, { jobId: 'bad' },
    { leaseSeconds: 0 }, { leaseSeconds: 301 }, { leaseSeconds: 1.5 },
  ]) await assert.rejects(renew({ ...input, ...invalid }));
  assert.equal(calls, 0);
});


function failedRow(overrides = {}) {
  return {
    id: claimedJobId, tenant_id: workerScope.tenantId,
    actor_id: 'actor-a', operation: 'invoice_delivery',
    status: 'failed', failure_code: 'ERP_WORKER_ERROR',
    claimed_by: null, claimed_at: null, lease_expires_at: null,
    created_at: new Date('2026-10-29T12:00:00Z'),
    updated_at: new Date('2026-10-29T12:03:00Z'),
    ...overrides,
  };
}

test('worker terminal failure is atomic, tenant-scoped, lease-bound and clears claim', async () => {
  const { failErpOperationJob: fail } = await import('../server/services/erpJobReservation.js');
  let captured;
  const db = { async query(sql, params) {
    captured = { sql, params };
    return { rows: [failedRow()] };
  } };
  const result = await fail({ db, authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: claimedJobId,
    failureCode: 'ERP_WORKER_ERROR' });
  assert.deepEqual(captured.params,
    ['tenant-a', 'invoice_delivery', claimedJobId, 'worker-a', 'ERP_WORKER_ERROR']);
  assert.match(captured.sql, /claimed_by = \$4 AND status = 'processing'/);
  assert.match(captured.sql, /lease_expires_at > now\(\)/);
  assert.match(captured.sql, /status = 'failed', failure_code = \$5/);
  assert.match(captured.sql, /claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL/);
  assert.equal(result.status, 'failed');
  assert.equal(result.failureCode, 'ERP_WORKER_ERROR');
  assert.equal('sent' in result, false);
  assert.equal(Object.isFrozen(result), true);
});

test('expired or already finished job cannot be failed again; database errors propagate', async () => {
  const { failErpOperationJob: fail } = await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope, operation: 'invoice_delivery',
    jobId: claimedJobId, failureCode: 'ERP_WORKER_ERROR' };
  assert.equal(await fail({ ...input, db: { query: async () => ({ rows: [] }) } }), null);
  await assert.rejects(fail({ ...input, db: {
    query: async () => { throw new Error('database offline'); },
  } }), /database offline/);
  await assert.rejects(fail({ ...input, db: {
    query: async () => ({ rows: [failedRow(), failedRow()] }),
  } }), /invalid failure result/);
});

test('worker failure rejects forged receipts and malformed timestamps', async () => {
  const { failErpOperationJob: fail } = await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope, operation: 'invoice_delivery',
    jobId: claimedJobId, failureCode: 'ERP_WORKER_ERROR' };
  for (const row of [
    failedRow({ tenant_id: 'foreign' }),
    failedRow({ operation: 'invoice_export' }),
    failedRow({ id: 'foreign' }),
    failedRow({ status: 'sent' }),
    failedRow({ failure_code: 'ERP_PROVIDER_REJECTED' }),
    failedRow({ claimed_by: 'worker-a' }),
    failedRow({ lease_expires_at: new Date() }),
    failedRow({ actor_id: '' }),
    failedRow({ updated_at: 'invalid' }),
    failedRow({ updated_at: new Date('2026-10-29T11:00:00Z') }),
  ]) await assert.rejects(fail({
    ...input, db: { query: async () => ({ rows: [row] }) },
  }), /invalid/);
});

test('worker failure validates scope, operation, ID and reason before database access', async () => {
  const { failErpOperationJob: fail } = await import('../server/services/erpJobReservation.js');
  let calls = 0;
  const db = { query: async () => { calls++; return { rows: [] }; } };
  const input = { db, authenticatedWorker: workerScope, operation: 'invoice_delivery',
    jobId: claimedJobId, failureCode: 'ERP_WORKER_ERROR' };
  for (const invalid of [
    { authenticatedWorker: null },
    { authenticatedWorker: { tenantId: 'tenant-a' } },
    { operation: 'settlement_execution' },
    { jobId: 'bad' },
    { failureCode: 'SENT' },
    { failureCode: 'ERP_PROVIDER_REJECTED; DROP TABLE' },
  ]) await assert.rejects(fail({ ...input, ...invalid }));
  assert.equal(calls, 0);
  const sql = readFileSync(new URL('../server/db/erp_operation_jobs.proposed.sql', import.meta.url), 'utf8');
  assert.match(sql, /failure_code text CHECK/);
  assert.match(sql, /CONSTRAINT erp_failure_reason_consistency CHECK/);
});


function quarantineRow(overrides = {}) {
  return {
    id: claimedJobId, tenant_id: workerScope.tenantId, actor_id: 'actor-a',
    operation: 'invoice_delivery', status: 'outcome_unknown', failure_code: null,
    claimed_by: null, claimed_at: null, lease_expires_at: null,
    created_at: new Date('2026-10-29T12:00:00Z'),
    updated_at: new Date('2026-10-29T12:04:00Z'), ...overrides,
  };
}

test('expired lease is atomically quarantined, not requeued or marked delivered', async () => {
  const { quarantineExpiredErpOperationJob: quarantine } =
    await import('../server/services/erpJobReservation.js');
  let captured;
  const db = { async query(sql, params) {
    captured = { sql, params }; return { rows: [quarantineRow()] };
  } };
  const result = await quarantine({ db, authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: claimedJobId });
  assert.deepEqual(captured.params, ['tenant-a', 'invoice_delivery', claimedJobId]);
  assert.match(captured.sql, /status = 'processing' AND lease_expires_at <= now\(\)/);
  assert.match(captured.sql, /SET status = 'outcome_unknown'/);
  assert.match(captured.sql, /claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL/);
  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.requiresReconciliation, true);
  assert.equal('sent' in result, false);
  assert.equal(Object.isFrozen(result), true);
});

test('no expired lease returns null; database errors and duplicate receipts fail closed', async () => {
  const { quarantineExpiredErpOperationJob: quarantine } =
    await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: claimedJobId };
  assert.equal(await quarantine({ ...input, db: { query: async () => ({ rows: [] }) } }), null);
  await assert.rejects(quarantine({ ...input, db: {
    query: async () => { throw new Error('database offline'); },
  } }), /database offline/);
  await assert.rejects(quarantine({ ...input, db: {
    query: async () => ({ rows: [quarantineRow(), quarantineRow()] }),
  } }), /invalid quarantine result/);
});

test('quarantine rejects foreign or fabricated receipts and malformed timestamps', async () => {
  const { quarantineExpiredErpOperationJob: quarantine } =
    await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: claimedJobId };
  for (const row of [
    quarantineRow({ tenant_id: 'other' }), quarantineRow({ operation: 'invoice_export' }),
    quarantineRow({ id: 'other' }), quarantineRow({ status: 'sent' }),
    quarantineRow({ failure_code: 'ERP_WORKER_ERROR' }),
    quarantineRow({ claimed_by: 'worker-a' }),
    quarantineRow({ lease_expires_at: new Date() }),
    quarantineRow({ actor_id: '' }), quarantineRow({ updated_at: 'bad' }),
    quarantineRow({ updated_at: new Date('2026-10-29T11:00:00Z') }),
  ]) await assert.rejects(quarantine({
    ...input, db: { query: async () => ({ rows: [row] }) },
  }), /invalid/);
});

test('quarantine rejects invalid scope, operation and job ID without querying', async () => {
  const { quarantineExpiredErpOperationJob: quarantine } =
    await import('../server/services/erpJobReservation.js');
  let calls = 0;
  const db = { query: async () => { calls++; return { rows: [] }; } };
  const input = { db, authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: claimedJobId };
  for (const invalid of [
    { authenticatedWorker: null }, { authenticatedWorker: { tenantId: 'tenant-a' } },
    { operation: 'settlement_execution' }, { jobId: 'invalid' },
  ]) await assert.rejects(quarantine({ ...input, ...invalid }));
  assert.equal(calls, 0);
});

test('actor status lookup can report outcome_unknown without claiming delivery', async () => {
  const { readErpOperationJobStatus } = await import('../server/services/erpJobReservation.js');
  const result = await readErpOperationJobStatus({
    db: { query: async () => ({ rows: [quarantineRow()] }) },
    authenticatedScope: scope, jobId: claimedJobId,
  });
  assert.equal(result.status, 'outcome_unknown');
  assert.equal('delivered' in result, false);
  const sql = readFileSync(new URL('../server/db/erp_operation_jobs.proposed.sql', import.meta.url), 'utf8');
  assert.match(sql, /'outcome_unknown'/);
});


test('job replay cannot acknowledge sent or processed without durable completion evidence', async () => {
  const db = fakeDatabase();
  await reserve({ db, ...args });
  const row = [...db.rows.values()][0];
  for (const status of ['sent', 'processed']) {
    row.status = status;
    await assert.rejects(reserve({ db, ...args }), /invalid job record/);
  }
  row.status = 'outcome_unknown';
  const quarantined = await reserve({ db, ...args });
  assert.equal(quarantined.status, 'outcome_unknown');
  assert.equal(quarantined.replayed, true);
});

test('actor status lookup rejects fabricated successful terminal states', async () => {
  const { readErpOperationJobStatus } = await import('../server/services/erpJobReservation.js');
  const base = {
    id: statusJobId, tenant_id: scope.tenantId, actor_id: scope.actorId,
    operation: 'invoice_delivery',
    created_at: new Date('2026-10-29T12:00:00Z'),
    updated_at: new Date('2026-10-29T12:01:00Z'),
  };
  for (const status of ['sent', 'processed']) {
    const db = { query: async () => ({ rows: [{ ...base, status }] }) };
    await assert.rejects(readErpOperationJobStatus({
      db, authenticatedScope: scope, jobId: statusJobId,
    }), /invalid tenant-bound status/);
  }
});

test('unapplied ERP schema forbids evidence-free successful terminal states', () => {
  const sql = readFileSync(new URL('../server/db/erp_operation_jobs.proposed.sql', import.meta.url), 'utf8');
  assert.match(sql, /status IN \('queued', 'processing', 'failed', 'outcome_unknown'\)/);
  assert.doesNotMatch(sql, /status IN \([^)]*'sent'/);
  assert.doesNotMatch(sql, /status IN \([^)]*'processed'/);
});


function dispatchedRow(overrides = {}) {
  return {
    ...claimedRow({
      dispatch_started_at: new Date('2026-10-29T12:01:30Z'),
      updated_at: new Date('2026-10-29T12:01:30Z'),
    }),
    ...overrides,
  };
}

test('pre-dispatch fence is atomic, tenant-bound, lease-bound, and not a delivery receipt', async () => {
  const { markErpOperationJobDispatchStarted: mark } =
    await import('../server/services/erpJobReservation.js');
  let captured;
  const db = { async query(sql, params) {
    captured = { sql, params };
    return { rows: [dispatchedRow()] };
  } };
  const result = await mark({ db, authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: claimedJobId });
  assert.deepEqual(captured.params, ['tenant-a', 'invoice_delivery', claimedJobId, 'worker-a']);
  assert.match(captured.sql, /SET dispatch_started_at = now\(\)/);
  assert.match(captured.sql, /claimed_by = \$4 AND status = 'processing'/);
  assert.match(captured.sql, /lease_expires_at > now\(\) AND dispatch_started_at IS NULL/);
  assert.equal(result.dispatchStartedAt, '2026-10-29T12:01:30.000Z');
  assert.equal(result.outcomeMayBeUnknown, true);
  assert.equal('delivered' in result, false);
  assert.equal(Object.isFrozen(result), true);
});

test('expired or already dispatched lease cannot start another dispatch; database failures propagate', async () => {
  const { markErpOperationJobDispatchStarted: mark } =
    await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: claimedJobId };
  assert.equal(await mark({ ...input, db: { query: async () => ({ rows: [] }) } }), null);
  await assert.rejects(mark({ ...input, db: {
    query: async () => { throw new Error('database offline'); },
  } }), /database offline/);
  await assert.rejects(mark({ ...input, db: {
    query: async () => ({ rows: [dispatchedRow(), dispatchedRow()] }),
  } }), /invalid dispatch fence result/);
});

test('dispatch fence rejects foreign receipts, invalid chronology, and invalid identity', async () => {
  const { markErpOperationJobDispatchStarted: mark } =
    await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: claimedJobId };
  for (const row of [
    dispatchedRow({ tenant_id: 'foreign' }),
    dispatchedRow({ claimed_by: 'foreign-worker' }),
    dispatchedRow({ actor_id: '' }),
    dispatchedRow({ operation: 'invoice_export' }),
    dispatchedRow({ status: 'failed' }),
    dispatchedRow({ dispatch_started_at: 'invalid' }),
    dispatchedRow({ dispatch_started_at: new Date('2026-10-29T12:00:30Z') }),
    dispatchedRow({ dispatch_started_at: new Date('2026-10-29T12:02:00Z') }),
    dispatchedRow({ updated_at: new Date('2026-10-29T12:01:00Z') }),
  ]) await assert.rejects(mark({ ...input,
    db: { query: async () => ({ rows: [row] }) },
  }), /invalid/);
  let calls = 0;
  const db = { query: async () => { calls++; return { rows: [] }; } };
  for (const invalid of [
    { authenticatedWorker: null },
    { authenticatedWorker: { tenantId: 'tenant-a' } },
    { operation: 'settlement_execution' }, { jobId: 'bad' },
  ]) await assert.rejects(mark({ ...input, db, ...invalid }));
  assert.equal(calls, 0);
});

test('terminal failure is forbidden once an external dispatch might have started', async () => {
  const { failErpOperationJob: fail } =
    await import('../server/services/erpJobReservation.js');
  let sql;
  await fail({
    db: { query: async (statement) => { sql = statement; return { rows: [] }; } },
    authenticatedWorker: workerScope, operation: 'invoice_delivery',
    jobId: claimedJobId, failureCode: 'ERP_WORKER_ERROR',
  });
  assert.match(sql, /lease_expires_at > now\(\) AND dispatch_started_at IS NULL/);
  const schema = readFileSync(new URL('../server/db/erp_operation_jobs.proposed.sql', import.meta.url), 'utf8');
  assert.match(schema, /dispatch_started_at timestamptz/);
  assert.match(schema, /CONSTRAINT erp_dispatch_fence_consistency CHECK/);
  assert.match(schema, /dispatch_started_at IS NULL OR status IN \('processing', 'outcome_unknown'\)/);
});
