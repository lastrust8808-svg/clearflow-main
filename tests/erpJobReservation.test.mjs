import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reserveErpOperationJob as reserve, claimErpOperationJob as claim, listErpOperationJobsNeedingReconciliation as list } from '../server/services/erpJobReservation.js';

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
          id: '123e4567-e89b-42d3-a456-' + String(rows.size + 1).padStart(12, '0'), tenant_id: tenantId,
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

test('durable idempotency ignores object key order but preserves invoice line order', async () => {
  const db = fakeDatabase();
  const insertedJson = [];
  const originalQuery = db.query.bind(db);
  db.query = async (sql, params) => {
    if (/INSERT INTO erp_operation_jobs/.test(sql)) insertedJson.push(params[5]);
    return originalQuery(sql, params);
  };
  const firstPayload = {
    invoiceId: 'invoice-123',
    metadata: { taxRate: 0.06, note: 'café' },
    lines: [
      { description: 'paint', amountCents: 1250 },
      { description: 'trim', amountCents: 250 },
    ],
  };
  const reorderedKeys = {
    lines: [
      { amountCents: 1250, description: 'paint' },
      { amountCents: 250, description: 'trim' },
    ],
    metadata: { note: 'café', taxRate: 0.06 },
    invoiceId: 'invoice-123',
  };
  const first = await reserve({ db, ...args, payload: firstPayload });
  const replay = await reserve({ db, ...args, payload: reorderedKeys });
  assert.equal(first.created, true);
  assert.equal(replay.replayed, true);
  assert.equal(first.id, replay.id);
  assert.equal(db.rows.size, 1);
  assert.equal(insertedJson[0], insertedJson[1],
    'equivalent nested JSON must persist and hash identically');

  // Array order is economically meaningful: line items cannot be reordered
  // under the same idempotency key and silently acknowledged as a replay.
  await assert.rejects(reserve({ db, ...args, payload: {
    ...firstPayload, lines: [...firstPayload.lines].reverse(),
  } }), { code: 'ERP_IDEMPOTENCY_CONFLICT' });
  assert.equal(db.rows.size, 1);
});

test('fresh durable reservation must be queued; replay may report an existing lifecycle state', async () => {
  // A fresh INSERT reporting processing/failed/outcome_unknown would claim a
  // lifecycle transition without a worker lease or audited failure. A replay
  // is different: the stored job may legitimately have progressed meanwhile.
  for (const status of ['processing', 'failed', 'outcome_unknown']) {
    const db = fakeDatabase();
    const original = db.query.bind(db);
    db.query = async (sql, params) => {
      const result = await original(sql, params);
      return /INSERT INTO erp_operation_jobs/.test(sql)
        ? { rows: result.rows.map(row => ({ ...row, status })) }
        : result;
    };
    await assert.rejects(reserve({ db, ...args }),
      /invalid initial reservation status/, 'fresh INSERT must not claim ' + status);
    assert.equal(db.calls, 1, 'invalid fresh receipt must not trigger fallback queries');
  }

  for (const status of ['queued', 'processing', 'failed', 'outcome_unknown']) {
    const db = fakeDatabase();
    const initial = await reserve({ db, ...args });
    [...db.rows.values()][0].status = status;
    const replay = await reserve({ db, ...args });
    assert.equal(replay.id, initial.id);
    assert.equal(replay.status, status);
    assert.equal(replay.created, false);
    assert.equal(replay.replayed, true);
  }
});

test('reservation never acknowledges fabricated or noncanonical database job IDs', async () => {
  // UUID is the proposed schema's primary key. A synthetic ID is not
  // durable database evidence, whether returned by INSERT or replay SELECT.
  for (const badId of ['job-1', '123e4567-e89b-42d3-a456-42661417400z',
    '123E4567-E89B-42D3-A456-426614174000', '', null]) {
    const inserted = fakeDatabase();
    const originalQuery = inserted.query.bind(inserted);
    inserted.query = async (...queryArgs) => {
      const result = await originalQuery(...queryArgs);
      return { rows: result.rows.map(row => ({ ...row, id: badId })) };
    };
    await assert.rejects(reserve({ db: inserted, ...args }), /invalid job record/,
      'inserted ID: ' + String(badId));

    const replay = fakeDatabase();
    await reserve({ db: replay, ...args });
    [...replay.rows.values()][0].id = badId;
    await assert.rejects(reserve({ db: replay, ...args }), /invalid job record/,
      'replayed ID: ' + String(badId));
  }
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

test('uppercase UUID status lookup matches canonical PostgreSQL receipt without weakening tenant scope', async () => {
  const { readErpOperationJobStatus: readStatus } =
    await import('../server/services/erpJobReservation.js');
  const requestedJobId = statusJobId.toUpperCase();
  const input = { authenticatedScope: scope, jobId: requestedJobId };
  const base = {
    id: statusJobId, tenant_id: scope.tenantId, actor_id: scope.actorId,
    operation: 'invoice_delivery', status: 'queued',
    created_at: new Date('2026-10-29T12:00:00Z'),
    updated_at: new Date('2026-10-29T12:01:00Z'),
  };
  let calls = 0;
  const db = { async query(sql, params) {
    calls++;
    assert.match(sql, /WHERE tenant_id = \$1 AND actor_id = \$2 AND id = \$3/);
    assert.deepEqual(params, [scope.tenantId, scope.actorId, statusJobId]);
    // PostgreSQL returns lowercase UUID text even when the caller used uppercase.
    return { rows: [base] };
  } };
  const receipt = await readStatus({ ...input, db });
  assert.equal(calls, 1);
  assert.equal(receipt.id, statusJobId);
  assert.equal(receipt.status, 'queued');
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal('delivered' in receipt, false);
  for (const forged of [
    { ...base, tenant_id: 'other-tenant' },
    { ...base, actor_id: 'other-actor' },
    { ...base, id: '123e4567-e89b-42d3-a456-426614174001' },
  ]) {
    await assert.rejects(readStatus({
      ...input, db: { query: async () => ({ rows: [forged] }) },
    }), /invalid tenant-bound status/);
  }
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
    dispatch_started_at: null, failure_code: null,
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

test('worker claim excludes stale dispatch fences and failure codes before side effects', async () => {
  const args = { authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  let queryCount = 0;
  const db = { async query(sql, params) {
    queryCount++;
    assert.deepEqual(params, ['tenant-a', 'invoice_delivery', 'worker-a', 60]);
    // Both the candidate selection and the atomic update must exclude jobs
    // that already carry dispatch evidence or a terminal failure marker.
    assert.match(sql, /status = 'queued'\s+AND dispatch_started_at IS NULL AND failure_code IS NULL/);
    assert.match(sql, /job\.status = 'queued'\s+AND job\.dispatch_started_at IS NULL AND job\.failure_code IS NULL/);
    assert.match(sql, /RETURNING[\s\S]*job\.dispatch_started_at, job\.failure_code/);
    return { rows: [claimedRow()] };
  } };
  const receipt = await claim({ ...args, db });
  assert.equal(queryCount, 1);
  assert.equal(receipt.status, 'processing');
  assert.equal('delivered' in receipt, false);

  // Even if a database adapter violates the SQL predicate or schema
  // constraints, contradictory evidence must never be acknowledged as a
  // valid worker claim eligible for provider dispatch.
  for (const row of [
    claimedRow({ dispatch_started_at: new Date('2026-10-29T12:00:30Z') }),
    claimedRow({ failure_code: 'ERP_PROVIDER_REJECTED' }),
    claimedRow({ dispatch_started_at: undefined }),
    claimedRow({ failure_code: undefined }),
  ]) {
    await assert.rejects(claim({
      ...args, db: { query: async () => ({ rows: [row] }) },
    }), /invalid tenant-bound worker claim/);
  }
  for (const missing of ['dispatch_started_at', 'failure_code']) {
    const row = claimedRow();
    delete row[missing];
    await assert.rejects(claim({
      ...args, db: { query: async () => ({ rows: [row] }) },
    }), /invalid tenant-bound worker claim/);
  }
});

test('worker claim excludes queued rows with stale worker ownership before dispatch', async () => {
  // The proposed schema prohibits stale leases on queued rows, but the
  // atomic claim must fail closed even when an older schema or corrupted
  // database record violates that invariant. Never overwrite another
  // worker's lease and present the new claim as exclusive.
  let queries = 0;
  const db = { async query(sql, params) {
    queries++;
    assert.deepEqual(params, ['tenant-a', 'invoice_delivery', 'worker-a', 60]);
    const candidate = sql.slice(sql.indexOf('WITH next_job AS'), sql.indexOf('FOR UPDATE SKIP LOCKED'));
    const update = sql.slice(sql.indexOf('WHERE job.id = next_job.id'), sql.indexOf('RETURNING job.id'));
    for (const [label, fragment] of [['candidate', candidate], ['atomic update', update]]) {
      for (const field of ['claimed_by', 'claimed_at', 'lease_expires_at']) {
        const prefix = label === 'candidate' ? '' : 'job.';
        assert.ok(fragment.includes(prefix + field + ' IS NULL'),
          label + ' must reject stale ' + field);
      }
    }
    // A queued row with stale ownership must not qualify for a new lease.
    return { rows: [] };
  } };
  const receipt = await claim({
    db, authenticatedWorker: workerScope, operation: 'invoice_delivery',
  });
  assert.equal(receipt, null);
  assert.equal(queries, 1);
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

test('worker claim receipts require canonical UTC timestamps and monotonic lease chronology', async () => {
  const input = { authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  const invalid = [
    claimedRow({ claimed_at: '2026-02-30T12:01:00Z' }),
    claimedRow({ created_at: '2026-10-29 12:00:00' }),
    claimedRow({ claimed_at: '2026-10-29T13:01:00+01:00' }),
    claimedRow({ lease_expires_at: 'tomorrow' }),
    claimedRow({ claimed_at: new Date(NaN) }),
    claimedRow({ created_at: new Date('2026-10-29T12:01:30Z') }),
    claimedRow({ updated_at: new Date('2026-10-29T12:00:59Z') }),
    claimedRow({ updated_at: new Date('2026-10-29T12:02:00Z') }),
  ];
  for (const row of invalid) {
    await assert.rejects(claim({
      ...input, db: { query: async () => ({ rows: [row] }) },
    }), /invalid worker lease timestamp/);
  }
  const valid = claimedRow({
    created_at: '2026-10-29T12:00:00Z',
    claimed_at: '2026-10-29T12:01:00.000Z',
    updated_at: '2026-10-29T12:01:00Z',
    lease_expires_at: '2026-10-29T12:02:00.000Z',
  });
  const receipt = await claim({
    ...input, db: { query: async () => ({ rows: [valid] }) },
  });
  assert.equal(receipt.status, 'processing');
  assert.equal(receipt.leaseExpiresAt, '2026-10-29T12:02:00.000Z');
  assert.equal(Object.isFrozen(receipt), true);
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

test('uppercase UUID cannot turn a persisted lease renewal into a false failure', async () => {
  const { renewErpOperationJobLease: renew } =
    await import('../server/services/erpJobReservation.js');
  const requestedJobId = claimedJobId.toUpperCase();
  let calls = 0;
  const db = { async query(sql, params) {
    calls++;
    assert.match(sql, /lease_expires_at = GREATEST/);
    assert.deepEqual(params, ['tenant-a', 'invoice_delivery', claimedJobId, 'worker-a', 60]);
    // PostgreSQL uuid columns return canonical lowercase text after a write.
    return { rows: [claimedRow({ lease_expires_at: new Date('2026-10-29T12:04:00Z') })] };
  } };
  const receipt = await renew({
    db, authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: requestedJobId,
  });
  assert.equal(calls, 1);
  assert.equal(receipt.id, claimedJobId);
  assert.equal(receipt.status, 'processing');
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal('delivered' in receipt, false);

  // Normalizing UUID case must not relax tenant or worker receipt checks.
  await assert.rejects(renew({
    db: { query: async () => ({ rows: [claimedRow({ tenant_id: 'other-tenant' })] }) },
    authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: requestedJobId,
  }), /invalid tenant-bound lease renewal/);
  await assert.rejects(renew({
    db: { query: async () => ({ rows: [claimedRow({ claimed_by: 'other-worker' })] }) },
    authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: requestedJobId,
  }), /invalid tenant-bound lease renewal/);
});

test('lease renewal rejects malformed UTC receipts and reversed lease chronology', async () => {
  const { renewErpOperationJobLease: renew } = await import('../server/services/erpJobReservation.js');
  const input = {
    authenticatedWorker: workerScope, operation: 'invoice_delivery',
    jobId: claimedJobId,
  };
  const invalid = [
    claimedRow({ created_at: '2026-02-30T12:00:00Z' }),
    claimedRow({ claimed_at: '2026-10-29T12:01:00+00:00' }),
    claimedRow({ updated_at: '2026-10-29 12:01:00' }),
    claimedRow({ lease_expires_at: 'tomorrow' }),
    claimedRow({ claimed_at: new Date(NaN) }),
    claimedRow({ created_at: new Date('2026-10-29T12:01:01Z') }),
    claimedRow({ claimed_at: new Date('2026-10-29T12:01:01Z') }),
    claimedRow({ updated_at: new Date('2026-10-29T12:04:00Z'),
      lease_expires_at: new Date('2026-10-29T12:04:00Z') }),
    claimedRow({ updated_at: new Date('2026-10-29T12:05:00Z'),
      lease_expires_at: new Date('2026-10-29T12:04:00Z') }),
  ];
  for (const row of invalid) {
    await assert.rejects(renew({
      ...input, db: { query: async () => ({ rows: [row] }) },
    }), /invalid lease renewal timestamp/);
  }
  const valid = claimedRow({
    created_at: '2026-10-29T12:00:00Z',
    claimed_at: '2026-10-29T12:01:00.000Z',
    updated_at: '2026-10-29T12:01:01Z',
    lease_expires_at: '2026-10-29T12:04:00.000Z',
  });
  const receipt = await renew({
    ...input, db: { query: async () => ({ rows: [valid] }) },
  });
  assert.equal(receipt.status, 'processing');
  assert.equal(receipt.claimedAt, '2026-10-29T12:01:00.000Z');
  assert.equal(receipt.leaseExpiresAt, '2026-10-29T12:04:00.000Z');
  assert.equal(Object.isFrozen(receipt), true);
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
    dispatch_started_at: null,
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

test('terminal failure receipt must prove no external dispatch was fenced', async () => {
  const { failErpOperationJob: fail } = await import('../server/services/erpJobReservation.js');
  const input = {
    authenticatedWorker: workerScope, operation: 'invoice_delivery',
    jobId: claimedJobId, failureCode: 'ERP_WORKER_ERROR',
  };
  let statement;
  const valid = await fail({ ...input, db: { async query(sql) {
    statement = sql;
    return { rows: [failedRow()] };
  } } });
  assert.equal(valid.status, 'failed');
  assert.match(statement, /dispatch_started_at IS NULL/);
  assert.match(statement, /RETURNING[\s\S]*dispatch_started_at, created_at/);

  // A simulated adapter returning contradictory or absent dispatch evidence
  // must never be acknowledged as a safely failed job. A provider operation
  // may already have started and needs reconciliation, not an automatic retry.
  for (const dispatch_started_at of [
    undefined, new Date('2026-10-29T12:01:00Z'),
    '2026-10-29T12:01:00Z',
  ]) {
    await assert.rejects(fail({ ...input, db: {
      query: async () => ({ rows: [failedRow({ dispatch_started_at })] }),
    } }), /invalid tenant-bound failure/);
  }
  const missing = failedRow();
  delete missing.dispatch_started_at;
  await assert.rejects(fail({ ...input, db: {
    query: async () => ({ rows: [missing] }),
  } }), /invalid tenant-bound failure/);
});

test('uppercase UUID cannot turn a durable terminal failure into a false failure', async () => {
  const { failErpOperationJob: fail } = await import('../server/services/erpJobReservation.js');
  const requestedJobId = claimedJobId.toUpperCase();
  let calls = 0;
  const db = { async query(sql, params) {
    calls++;
    assert.match(sql, /dispatch_started_at IS NULL/);
    assert.deepEqual(params, [
      'tenant-a', 'invoice_delivery', claimedJobId, 'worker-a', 'ERP_WORKER_ERROR',
    ]);
    // PostgreSQL UUID receipts use canonical lowercase even for uppercase input.
    return { rows: [failedRow()] };
  } };
  const receipt = await fail({
    db, authenticatedWorker: workerScope, operation: 'invoice_delivery',
    jobId: requestedJobId, failureCode: 'ERP_WORKER_ERROR',
  });
  assert.equal(calls, 1);
  assert.equal(receipt.id, claimedJobId);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.failureCode, 'ERP_WORKER_ERROR');
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal('sent' in receipt, false);

  // Case normalization must not weaken the tenant or job receipt boundary.
  for (const row of [
    failedRow({ tenant_id: 'other-tenant' }),
    failedRow({ id: '123e4567-e89b-42d3-a456-426614174001' }),
  ]) {
    await assert.rejects(fail({
      db: { query: async () => ({ rows: [row] }) },
      authenticatedWorker: workerScope, operation: 'invoice_delivery',
      jobId: requestedJobId, failureCode: 'ERP_WORKER_ERROR',
    }), /invalid tenant-bound failure/);
  }
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
    dispatch_started_at: null,
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

test('uppercase UUID cannot turn a persisted expired-lease quarantine into a false failure', async () => {
  const { quarantineExpiredErpOperationJob: quarantine } =
    await import('../server/services/erpJobReservation.js');
  const requestedJobId = claimedJobId.toUpperCase();
  const input = { authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: requestedJobId };
  const db = { async query(sql, params) {
    assert.deepEqual(params, ['tenant-a', 'invoice_delivery', claimedJobId]);
    assert.match(sql, /SET status = 'outcome_unknown'/);
    // PostgreSQL returns a lowercase UUID even when input is uppercase.
    return { rows: [quarantineRow()] };
  } };
  const receipt = await quarantine({ ...input, db });
  assert.equal(receipt.id, claimedJobId);
  assert.equal(receipt.status, 'outcome_unknown');
  assert.equal(receipt.requiresReconciliation, true);
  assert.equal('delivered' in receipt, false);

  // Canonicalizing the input must not weaken the persisted receipt boundary.
  for (const forged of [
    quarantineRow({ tenant_id: 'other-tenant' }),
    quarantineRow({ id: '123e4567-e89b-42d3-a456-426614174001' }),
  ]) {
    await assert.rejects(quarantine({ ...input, db: {
      query: async () => ({ rows: [forged] }),
    } }), /invalid tenant-bound quarantine/);
  }
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

test('pre-dispatch fence rejects stale or missing failure evidence before any external effect', async () => {
  const { markErpOperationJobDispatchStarted: mark } =
    await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: claimedJobId };
  let sql;
  const accepted = await mark({ ...input, db: { query: async (statement) => {
    sql = statement;
    return { rows: [dispatchedRow()] };
  } } });
  assert.equal(accepted.outcomeMayBeUnknown, true);
  assert.match(sql, /dispatch_started_at IS NULL\s+AND failure_code IS NULL AND claimed_at IS NOT NULL/);
  assert.match(sql, /RETURNING[\s\S]*dispatch_started_at, failure_code, lease_expires_at/);
  for (const failureCode of ['ERP_WORKER_ERROR', undefined]) {
    const row = dispatchedRow({ failure_code: failureCode });
    if (failureCode === undefined) delete row.failure_code;
    await assert.rejects(mark({ ...input, db: {
      query: async () => ({ rows: [row] }),
    } }), /invalid tenant-bound dispatch fence/);
  }
  assert.equal(await mark({ ...input, db: { query: async () => ({ rows: [] }) } }), null);
});

test('uppercase UUID input cannot turn a persisted dispatch fence into a false failure', async () => {
  const { markErpOperationJobDispatchStarted: mark } =
    await import('../server/services/erpJobReservation.js');
  const requestedJobId = claimedJobId.toUpperCase();
  let calls = 0;
  const db = { async query(sql, params) {
    calls++;
    assert.match(sql, /dispatch_started_at = now\(\)/);
    assert.deepEqual(params, ['tenant-a', 'invoice_delivery', claimedJobId, 'worker-a']);
    // PostgreSQL uuid columns return canonical lowercase text.
    return { rows: [dispatchedRow()] };
  } };
  const receipt = await mark({
    db, authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: requestedJobId,
  });
  assert.equal(calls, 1);
  assert.equal(receipt.id, claimedJobId);
  assert.equal(receipt.status, 'processing');
  assert.equal(receipt.outcomeMayBeUnknown, true);
  assert.equal(Object.isFrozen(receipt), true);

  // Canonicalization must not weaken the tenant/worker receipt boundary.
  await assert.rejects(mark({
    db: { query: async () => ({ rows: [dispatchedRow({ tenant_id: 'other-tenant' })] }) },
    authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: requestedJobId,
  }), /invalid tenant-bound dispatch fence/);
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

test('dispatch fence requires canonical UTC timestamps and monotonic lease chronology', async () => {
  const { markErpOperationJobDispatchStarted: mark } =
    await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope,
    operation: 'invoice_delivery', jobId: claimedJobId };
  const invalid = [
    { dispatch_started_at: '2026-02-30T12:01:30Z' },
    { dispatch_started_at: '2026-10-29 12:01:30' },
    { dispatch_started_at: '2026-10-29T08:01:30-04:00' },
    { lease_expires_at: '2026-02-30T12:02:00Z' },
    { created_at: '2026-10-29T12:01:01Z' },
    { claimed_at: '2026-10-29T12:01:31Z' },
    { updated_at: '2026-10-29T12:01:29Z' },
    { updated_at: '2026-10-29T12:02:00Z' },
    { updated_at: '2026-10-29T12:02:01Z' },
  ];
  for (const overrides of invalid) {
    await assert.rejects(mark({ ...input, db: {
      query: async () => ({ rows: [dispatchedRow(overrides)] }),
    } }), /invalid dispatch fence timestamp/, JSON.stringify(overrides));
  }
  const valid = await mark({ ...input, db: {
    query: async () => ({ rows: [dispatchedRow({
      created_at: '2026-10-29T12:00:00Z',
      claimed_at: '2026-10-29T12:01:00Z',
      dispatch_started_at: '2026-10-29T12:01:30Z',
      updated_at: '2026-10-29T12:01:30Z',
      lease_expires_at: '2026-10-29T12:02:00Z',
    })] }),
  } });
  assert.equal(valid.dispatchStartedAt, '2026-10-29T12:01:30Z');
  assert.equal(valid.outcomeMayBeUnknown, true);
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

test('reservation rejects Proxy payloads before triggering reflection traps or database writes', async () => {
  const db = fakeDatabase();
  let traps = 0;
  const trap = {
    getPrototypeOf() { traps++; throw new Error('unexpected prototype trap'); },
    ownKeys() { traps++; throw new Error('unexpected ownKeys trap'); },
    get() { traps++; throw new Error('unexpected get trap'); },
  };
  const root = new Proxy({ invoiceId: 'invoice-123' }, trap);
  const nested = { invoiceId: 'invoice-123', line: new Proxy({ amount: 125 }, trap) };
  const array = { invoiceId: 'invoice-123', lines: new Proxy([{ amount: 125 }], trap) };
  for (const payload of [root, nested, array]) {
    await assert.rejects(reserve({ db, ...args, payload }), /ERP job payload contains a Proxy/);
  }
  assert.equal(traps, 0);
  assert.equal(db.calls, 0);
});


test('ambiguous reservation insert or replay lookup rows fail closed', async () => {
  // A malformed adapter must not turn multiple database records into a
  // single durable acknowledgement by silently selecting rows[0].
  const inserted = {
    id: 'job-1', tenant_id: scope.tenantId, actor_id: scope.actorId,
    operation: args.operation, idempotency_key: args.idempotencyKey,
    payload_sha256: 'a'.repeat(64), status: 'queued',
    created_at: new Date('2026-10-29T12:00:00Z'),
  };
  let calls = 0;
  const duplicateInsert = { query: async () => {
    calls++;
    return { rows: [inserted, inserted] };
  } };
  await assert.rejects(reserve({ db: duplicateInsert, ...args }), /invalid reservation result/);
  assert.equal(calls, 1, 'ambiguous insert must not trigger a replay lookup');

  calls = 0;
  const duplicateLookup = { query: async () => {
    calls++;
    return calls === 1 ? { rows: [] } : { rows: [inserted, inserted] };
  } };
  await assert.rejects(reserve({ db: duplicateLookup, ...args }), /invalid reservation lookup/);
  assert.equal(calls, 2);

  for (const invalidRows of [null, {}, { rows: null }, { rows: {} }]) {
    await assert.rejects(reserve({
      db: { query: async () => invalidRows }, ...args,
    }), /invalid reservation result/);
  }
});


test('restart recovery quarantines a bounded batch atomically without retry or provider calls', async () => {
  const { quarantineExpiredErpOperationJobsBatch: sweep } =
    await import('../server/services/erpJobReservation.js');
  const secondId = '123e4567-e89b-42d3-a456-426614174001';
  let captured;
  const db = { async query(sql, params) {
    captured = { sql, params };
    return { rows: [
      quarantineRow({ dispatch_started_at: new Date('2026-10-29T12:01:30Z') }),
      quarantineRow({ id: secondId, dispatch_started_at: null }),
    ] };
  } };
  const rows = await sweep({ db, authenticatedWorker: workerScope,
    operation: 'invoice_delivery', maxJobs: 2 });
  assert.deepEqual(captured.params, ['tenant-a', 'invoice_delivery', 2]);
  assert.match(captured.sql, /tenant_id = \$1 AND operation = \$2 AND status = 'processing'/);
  assert.match(captured.sql, /lease_expires_at <= now\(\)/);
  assert.match(captured.sql, /FOR UPDATE SKIP LOCKED LIMIT \$3/);
  assert.match(captured.sql, /SET status = 'outcome_unknown'/);
  assert.match(captured.sql, /claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL/);
  assert.doesNotMatch(captured.sql, /SET status = 'queued'|SET status = 'failed'/);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'outcome_unknown');
  assert.equal(rows[0].requiresReconciliation, true);
  assert.equal(rows[0].dispatchStartedAt, '2026-10-29T12:01:30.000Z');
  assert.equal(rows[1].dispatchStartedAt, null);
  assert.equal(Object.isFrozen(rows), true);
  assert.equal(Object.isFrozen(rows[0]), true);
  assert.equal('sent' in rows[0], false);
});

test('restart recovery rejects invalid worker scope and unbounded batches before database access', async () => {
  const { quarantineExpiredErpOperationJobsBatch: sweep } =
    await import('../server/services/erpJobReservation.js');
  let calls = 0;
  const db = { query: async () => { calls++; return { rows: [] }; } };
  const input = { db, authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  for (const invalid of [
    { authenticatedWorker: null },
    { authenticatedWorker: { tenantId: 'tenant-a' } },
    { operation: 'settlement_execution' },
    { maxJobs: 0 }, { maxJobs: 101 }, { maxJobs: 1.5 },
  ]) await assert.rejects(sweep({ ...input, ...invalid }));
  assert.equal(calls, 0);
  assert.deepEqual(await sweep(input), []);
  assert.equal(calls, 1);
});

test('restart recovery fails closed on database failure, oversized and forged results', async () => {
  const { quarantineExpiredErpOperationJobsBatch: sweep } =
    await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope,
    operation: 'invoice_delivery', maxJobs: 1 };
  await assert.rejects(sweep({ ...input, db: {
    query: async () => { throw new Error('database offline'); },
  } }), /database offline/);
  for (const rows of [
    null,
    [quarantineRow(), quarantineRow()],
    [quarantineRow({ tenant_id: 'foreign' })],
    [quarantineRow({ operation: 'invoice_export' })],
    [quarantineRow({ status: 'sent' })],
    [quarantineRow({ claimed_by: 'worker-a' })],
    [quarantineRow({ failure_code: 'ERP_WORKER_ERROR' })],
    [quarantineRow({ dispatch_started_at: 'invalid' })],
    [quarantineRow({ dispatch_started_at: new Date('2026-10-29T12:05:00Z') })],
  ]) {
    await assert.rejects(sweep({ ...input, db: {
      query: async () => ({ rows }),
    } }), /invalid/);
  }
});

test('restart recovery rejects duplicate job identities in the same batch', async () => {
  const { quarantineExpiredErpOperationJobsBatch: sweep } =
    await import('../server/services/erpJobReservation.js');
  await assert.rejects(sweep({
    authenticatedWorker: workerScope, operation: 'invoice_delivery', maxJobs: 2,
    db: { query: async () => ({ rows: [quarantineRow(), quarantineRow()] }) },
  }), /invalid tenant-bound recovery record/);
});


test('reconciliation backlog lists bounded tenant-scoped unknown outcomes without payload or success claims', async () => {
  const { listErpOperationJobsNeedingReconciliation: list } =
    await import('../server/services/erpJobReservation.js');
  const secondId = '123e4567-e89b-42d3-a456-426614174001';
  let captured;
  const db = { async query(sql, params) {
    captured = { sql, params };
    return { rows: [
      quarantineRow({ dispatch_started_at: null }),
      quarantineRow({ id: secondId, dispatch_started_at: new Date('2026-10-29T12:01:30Z') }),
    ] };
  } };
  const result = await list({ db, authenticatedWorker: workerScope,
    operation: 'invoice_delivery', maxJobs: 2 });
  assert.deepEqual(captured.params, ['tenant-a', 'invoice_delivery', 2, null]);
  assert.match(captured.sql, /tenant_id = \$1 AND operation = \$2 AND status = 'outcome_unknown'/);
  assert.match(captured.sql, /AND \(\$4::uuid IS NULL OR id > \$4::uuid\)/);
  assert.match(captured.sql, /ORDER BY id ASC LIMIT \$3/);
  assert.equal(result.jobs.length, 2);
  assert.equal(result.nextAfterJobId, secondId);
  assert.equal(result.jobs[0].status, 'outcome_unknown');
  assert.equal(result.jobs[0].requiresReconciliation, true);
  assert.equal(result.jobs[0].dispatchStartedAt, null);
  assert.equal(result.jobs[1].dispatchStartedAt, '2026-10-29T12:01:30.000Z');
  assert.equal('payload' in result.jobs[0], false);
  assert.equal('recipient' in result.jobs[0], false);
  assert.equal('delivered' in result.jobs[0], false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.jobs), true);
  assert.equal(Object.isFrozen(result.jobs[0]), true);
});

test('reconciliation backlog supports stable UUID keyset pagination and empty pages', async () => {
  const { listErpOperationJobsNeedingReconciliation: list } =
    await import('../server/services/erpJobReservation.js');
  const secondId = '123e4567-e89b-42d3-a456-426614174001';
  let params;
  const db = { async query(_sql, values) {
    params = values;
    return { rows: [quarantineRow({ id: secondId })] };
  } };
  const result = await list({ db, authenticatedWorker: workerScope,
    operation: 'invoice_delivery', afterJobId: claimedJobId, maxJobs: 2 });
  assert.deepEqual(params, ['tenant-a', 'invoice_delivery', 2, claimedJobId]);
  assert.equal(result.jobs[0].id, secondId);
  assert.equal(result.nextAfterJobId, null);
  const empty = await list({ db: { query: async () => ({ rows: [] }) },
    authenticatedWorker: workerScope, operation: 'invoice_delivery' });
  assert.deepEqual(empty.jobs, []);
  assert.equal(empty.nextAfterJobId, null);
});

test('reconciliation backlog validates worker scope, operation, page size and cursor before querying', async () => {
  const { listErpOperationJobsNeedingReconciliation: list } =
    await import('../server/services/erpJobReservation.js');
  let calls = 0;
  const db = { query: async () => { calls++; return { rows: [] }; } };
  const input = { db, authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  for (const invalid of [
    { authenticatedWorker: null },
    { authenticatedWorker: { tenantId: 'tenant-a' } },
    { operation: 'settlement_execution' },
    { maxJobs: 0 }, { maxJobs: 101 }, { maxJobs: 2.5 },
    { afterJobId: 'invalid' }, { afterJobId: 3 },
  ]) await assert.rejects(list({ ...input, ...invalid }));
  assert.equal(calls, 0);
});

test('reconciliation backlog fails closed on database errors, forged rows and ambiguous ordering', async () => {
  const { listErpOperationJobsNeedingReconciliation: list } =
    await import('../server/services/erpJobReservation.js');
  const secondId = '123e4567-e89b-42d3-a456-426614174001';
  const input = { authenticatedWorker: workerScope,
    operation: 'invoice_delivery', maxJobs: 2 };
  await assert.rejects(list({ ...input, db: {
    query: async () => { throw new Error('database offline'); },
  } }), /database offline/);
  for (const rows of [
    null,
    [quarantineRow(), quarantineRow(), quarantineRow()],
    [quarantineRow(), quarantineRow()],
    [quarantineRow({ id: secondId }), quarantineRow()],
    [quarantineRow({ tenant_id: 'foreign' })],
    [quarantineRow({ actor_id: '' })],
    [quarantineRow({ operation: 'invoice_export' })],
    [quarantineRow({ status: 'sent' })],
    [quarantineRow({ updated_at: 'invalid' })],
    [quarantineRow({ dispatch_started_at: new Date('2026-10-29T12:05:00Z') })],
  ]) await assert.rejects(list({ ...input, db: {
    query: async () => ({ rows }),
  } }), /invalid/);
  await assert.rejects(list({ ...input, afterJobId: secondId, db: {
    query: async () => ({ rows: [quarantineRow()] }),
  } }), /invalid tenant-bound reconciliation record/);
});


test('authenticated ERP identities reject control, bidi and malformed Unicode before storage', async () => {
  const db = fakeDatabase();
  const invalid = [
    ' tenant-a', 'tenant-a ', 'tenant\0a',
    'tenant\u200ba', 'tenant\u202ea', 'tenant\u2060a',
    'tenant' + String.fromCharCode(0xd800) + 'a',
    'tenant' + String.fromCharCode(0xdc00) + 'a',
  ];
  for (const id of invalid) {
    await assert.rejects(reserve({
      db, ...args, authenticatedScope: { ...scope, tenantId: id },
    }), /Invalid authenticated tenant/);
    await assert.rejects(reserve({
      db, ...args, authenticatedScope: { ...scope, actorId: id },
    }), /Invalid authenticated actor/);
  }
  assert.equal(db.calls, 0, 'invalid identity must not reach persistence');
});

test('ERP worker claims and reconciliation reads reject ambiguous worker identities', async () => {
  const db = fakeDatabase();
  for (const workerId of ['worker\u200ba', 'worker\u202ea', 'worker\nx',
    'worker' + String.fromCharCode(0xd800)]) {
    const authenticatedWorker = { tenantId: 'tenant-a', workerId };
    await assert.rejects(claim({
      db, authenticatedWorker, operation: 'invoice_delivery',
    }), /Invalid authenticated worker/);
    await assert.rejects(list({
      db, authenticatedWorker, operation: 'invoice_delivery',
    }), /Invalid authenticated worker/);
  }
  assert.equal(db.calls, 0, 'invalid worker identity must not query storage');
});

test('ERP identity validation preserves ordinary Unicode identifiers', async () => {
  const db = fakeDatabase();
  const authenticatedScope = { tenantId: 'société-a', actorId: 'élève-a' };
  const result = await reserve({ db, ...args, authenticatedScope });
  assert.equal(result.created, true);
  assert.equal(result.tenantId, authenticatedScope.tenantId);
  assert.equal(db.calls, 1);
});


test('ERP reservations reject inherited array serializer hooks before persistence', async () => {
  const db = fakeDatabase();
  const rows = [{ amountMinor: 12500 }];
  Object.setPrototypeOf(rows, {
    toJSON() { return [{ amountMinor: 0 }]; },
  });
  // Without the prototype guard, JSON.stringify silently changes the
  // financial rows before the idempotency digest and database INSERT.
  assert.equal(JSON.stringify({ rows }), '{"rows":[{"amountMinor":0}]}');
  const subclassRows = new (class extends Array {})();
  subclassRows.push({ amountMinor: 12500 });
  for (const payload of [
    { invoiceId: 'invoice-123', rows },
    { invoiceId: 'invoice-123', rows: subclassRows },
  ]) {
    await assert.rejects(
      reserve({ db, ...args, payload }),
      /ERP job payload contains an unsafe array prototype/,
    );
  }
  assert.equal(db.calls, 0, 'unsafe payload must not reach the database');
  const ordinary = await reserve({ db, ...args, payload: {
    invoiceId: 'invoice-123', rows: [{ amountMinor: 12500 }],
  } });
  assert.equal(ordinary.created, true);
  assert.equal(db.calls, 1);
});


test('ERP reservation and status reject inherited or accessor-backed authenticated identity before SQL', async () => {
  const { readErpOperationJobStatus } = await import('../server/services/erpJobReservation.js');
  let getterCalls = 0;
  const inheritedTenant = Object.assign(Object.create({ tenantId: 'tenant-a' }), { actorId: 'actor-a' });
  const inheritedActor = Object.assign(Object.create({ actorId: 'actor-a' }), { tenantId: 'tenant-a' });
  const accessorTenant = { actorId: 'actor-a' };
  Object.defineProperty(accessorTenant, 'tenantId', {
    enumerable: true, get() { getterCalls++; throw new Error('untrusted identity getter'); },
  });
  const accessorActor = { tenantId: 'tenant-a' };
  Object.defineProperty(accessorActor, 'actorId', {
    enumerable: true, get() { getterCalls++; throw new Error('untrusted identity getter'); },
  });
  const hiddenTenant = { actorId: 'actor-a' };
  Object.defineProperty(hiddenTenant, 'tenantId', { value: 'tenant-a', enumerable: false });
  const symbolClaim = { ...scope, [Symbol('tenant')]: 'other' };
  const proxied = new Proxy({ ...scope }, {
    get() { getterCalls++; throw new Error('untrusted proxy getter'); },
  });
  const db = fakeDatabase();
  for (const authenticatedScope of [
    inheritedTenant, inheritedActor, accessorTenant, accessorActor,
    hiddenTenant, symbolClaim, proxied,
  ]) {
    await assert.rejects(reserve({ db, ...args, authenticatedScope }), /Authenticated ERP scope/);
    await assert.rejects(readErpOperationJobStatus({
      db, authenticatedScope, jobId: '123e4567-e89b-42d3-a456-426614174000',
    }), /Authenticated ERP scope/);
  }
  assert.equal(getterCalls, 0);
  assert.equal(db.calls, 0);

  // Null-prototype records with explicit own identity fields remain valid.
  const plain = Object.assign(Object.create(null), scope);
  assert.equal((await reserve({ db, ...args, authenticatedScope: plain })).status, 'queued');
  assert.equal(await readErpOperationJobStatus({
    db, authenticatedScope: plain, jobId: '123e4567-e89b-42d3-a456-426614174000',
  }), null);
});

test('worker identity provenance is required for all ERP job mutations and recovery reads', async () => {
  const {
    renewErpOperationJobLease: renew,
    markErpOperationJobDispatchStarted: dispatch,
    failErpOperationJob: fail,
    quarantineExpiredErpOperationJob: quarantine,
    quarantineExpiredErpOperationJobsBatch: sweep,
  } = await import('../server/services/erpJobReservation.js');
  const db = fakeDatabase();
  const jobId = '123e4567-e89b-42d3-a456-426614174000';
  const methods = [claim, renew, dispatch, fail, quarantine, sweep, list];
  let getterCalls = 0;
  const inheritedTenant = Object.assign(Object.create({ tenantId: 'tenant-a' }), { workerId: 'worker-a' });
  const inheritedWorker = Object.assign(Object.create({ workerId: 'worker-a' }), { tenantId: 'tenant-a' });
  const accessorTenant = { workerId: 'worker-a' };
  Object.defineProperty(accessorTenant, 'tenantId', {
    enumerable: true, get() { getterCalls++; throw new Error('untrusted worker getter'); },
  });
  const accessorWorker = { tenantId: 'tenant-a' };
  Object.defineProperty(accessorWorker, 'workerId', {
    enumerable: true, get() { getterCalls++; throw new Error('untrusted worker getter'); },
  });
  const hiddenTenant = { workerId: 'worker-a' };
  Object.defineProperty(hiddenTenant, 'tenantId', { value: 'tenant-a', enumerable: false });
  const symbolClaim = { ...workerScope, [Symbol('tenant')]: 'foreign' };
  const proxy = new Proxy({ ...workerScope }, {
    get() { getterCalls++; throw new Error('untrusted proxy getter'); },
  });
  for (const authenticatedWorker of [
    inheritedTenant, inheritedWorker, accessorTenant, accessorWorker,
    hiddenTenant, symbolClaim, proxy, new (class Worker {
      constructor() { Object.assign(this, workerScope); }
    })(),
  ]) {
    for (const method of methods) {
      await assert.rejects(method({
        db, authenticatedWorker, operation: 'invoice_delivery',
        jobId, failureCode: 'ERP_WORKER_ERROR',
      }), /Authenticated ERP worker/);
    }
  }
  assert.equal(getterCalls, 0, 'identity validation must never invoke getters');
  assert.equal(db.calls, 0, 'untrusted worker identity must never reach SQL');

  // Legitimate null-prototype authentication records remain usable.
  const authenticatedWorker = Object.assign(Object.create(null), workerScope);
  assert.equal(await claim({ db: { query: async () => ({ rows: [] }) },
    authenticatedWorker, operation: 'invoice_delivery' }), null);
});

test('reservation rejects unsafe financial integers before SQL without rejecting exact boundary values', async () => {
  const db = fakeDatabase();
  const invalidPayloads = [
    { amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { invoice: { lines: [{ quantity: -(Number.MAX_SAFE_INTEGER + 1) }] } },
    { balances: [0, 2 ** 53] },
  ];
  for (const payload of invalidPayloads) {
    await assert.rejects(reserve({ db, ...args, payload }), /unsafe integer/);
  }
  assert.equal(db.calls, 0, 'unsafe amounts must not reserve jobs');

  const accepted = await reserve({
    db, ...args,
    payload: { amountMinor: Number.MAX_SAFE_INTEGER, adjustment: -Number.MAX_SAFE_INTEGER, taxRate: 0.075 },
  });
  assert.equal(accepted.created, true);
  assert.equal(db.calls, 1);
});

test('reservation rejects fractional minor units and negative zero without a database write', async () => {
  const db = fakeDatabase();
  for (const payload of [
    { amountMinor: 125.5 },
    { invoice: { lines: [{ lineTotalMinor: 199.01 }] } },
    { fees: [{ feeCents: 0.5 }] },
    { ledger: { balanceMinor: -1.25 } },
    { amountMinor: -0 },
    { invoice: { adjustment: -0 } },
  ]) {
    await assert.rejects(reserve({ db, ...args, payload }),
      /ERP job payload contains (an invalid minor-unit amount|negative zero)/);
  }
  assert.equal(db.calls, 0, 'ambiguous financial numbers must never reach SQL');

  // Integer minor units and decimal rate fields are distinct representations.
  const accepted = await reserve({
    db, ...args,
    payload: { invoice: { lines: [{ lineTotalMinor: 199 }, { feeCents: -25 }] },
      amountMinor: 0, taxRate: 0.075 },
  });
  assert.equal(accepted.created, true);
  assert.equal(db.calls, 1);
});


test('reservation rejects nonnumeric minor-unit values before SQL without coercion', async () => {
  const db = fakeDatabase();
  for (const payload of [
    { amountMinor: '12500' },
    { invoice: { lines: [{ lineTotalMinor: '125.5' }] } },
    { fees: [{ feeCents: null }] },
    { ledger: { balanceMinor: true } },
    { amountMinor: { cents: 125 } },
    { amountMinor: [125] },
  ]) {
    await assert.rejects(reserve({ db, ...args, payload }), /invalid minor-unit amount/);
  }
  assert.equal(db.calls, 0, 'invalid minor-unit representations must not reach SQL');

  const accepted = await reserve({
    db, ...args,
    payload: { amountMinor: 12500, refundCents: -25, feeCents: 0, taxRate: 0.075 },
  });
  assert.equal(accepted.created, true);
  assert.equal(db.calls, 1);
});

test('ERP job receipts reject malformed persisted timestamps and reversed status chronology', async () => {
  const { readErpOperationJobStatus } = await import('../server/services/erpJobReservation.js');
  const validCreated = '2026-10-29T12:00:00Z';
  const validUpdated = '2026-10-29T12:01:00Z';
  const invalidCreated = [
    '2026-02-30T12:00:00Z', '2026-10-29T24:00:00Z',
    '2026-10-29T12:00:00-04:00', 'tomorrow', new Date(NaN),
  ];
  for (const created_at of invalidCreated) {
    const db = fakeDatabase();
    const query = db.query.bind(db);
    db.query = async (...params) => {
      const result = await query(...params);
      return { rows: result.rows.map(row => ({ ...row, created_at })) };
    };
    await assert.rejects(reserve({ db, ...args }), /invalid creation timestamp/);
  }

  for (const [created_at, updated_at] of [
    ...invalidCreated.map(created => [created, validUpdated]),
    [validCreated, '2026-02-30T12:01:00Z'],
    [validCreated, '2026-10-29T12:01:00+01:00'],
    [validCreated, '2026-10-29T11:59:59Z'],
    [validCreated, new Date(NaN)],
  ]) {
    const db = { async query() {
      return { rows: [{
        id: statusJobId, tenant_id: scope.tenantId, actor_id: scope.actorId,
        operation: 'invoice_delivery', status: 'queued', created_at, updated_at,
      }] };
    } };
    await assert.rejects(readErpOperationJobStatus({
      db, authenticatedScope: scope, jobId: statusJobId,
    }), /invalid status timestamp/);
  }

  const db = { async query() {
    return { rows: [{
      id: statusJobId, tenant_id: scope.tenantId, actor_id: scope.actorId,
      operation: 'invoice_delivery', status: 'queued',
      created_at: validCreated, updated_at: validUpdated,
    }] };
  } };
  const status = await readErpOperationJobStatus({
    db, authenticatedScope: scope, jobId: statusJobId,
  });
  assert.equal(status.createdAt, validCreated);
  assert.equal(status.updatedAt, validUpdated);
});

test('ERP terminal failure receipt requires canonical UTC timestamps and monotonic chronology', async () => {
  const { failErpOperationJob: fail } = await import('../server/services/erpJobReservation.js');
  const input = {
    authenticatedWorker: workerScope, operation: 'invoice_delivery',
    jobId: claimedJobId, failureCode: 'ERP_WORKER_ERROR',
  };
  const validCreated = '2026-10-29T12:00:00Z';
  const validUpdated = '2026-10-29T12:03:00Z';
  const invalidRows = [
    ...[
      '2026-02-30T12:00:00Z', '2026-10-29T24:00:00Z',
      '2026-10-29T12:00:00-04:00', 'tomorrow', new Date(NaN),
    ].map(created_at => failedRow({ created_at, updated_at: validUpdated })),
    ...[
      '2026-02-30T12:03:00Z', '2026-10-29T12:03:00+01:00',
      '2026-10-29T12:03:00.1234Z', new Date(NaN),
      '2026-10-29T11:59:59Z',
    ].map(updated_at => failedRow({ created_at: validCreated, updated_at })),
  ];
  for (const row of invalidRows) {
    await assert.rejects(fail({
      ...input, db: { query: async () => ({ rows: [row] }) },
    }), /invalid failure timestamp/);
  }
  const receipt = await fail({
    ...input,
    db: { query: async () => ({ rows: [failedRow({
      created_at: validCreated, updated_at: validUpdated,
    })] }) },
  });
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.createdAt, validCreated);
  assert.equal(receipt.updatedAt, validUpdated);
  assert.equal('delivered' in receipt, false);
});


test('ERP recovery receipts require canonical UTC timestamps across single, batch and backlog reads', async () => {
  const {
    quarantineExpiredErpOperationJob: quarantine,
    quarantineExpiredErpOperationJobsBatch: sweep,
  } = await import('../server/services/erpJobReservation.js');
  const base = { authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  const methods = [
    row => quarantine({ ...base, jobId: claimedJobId,
      db: { query: async () => ({ rows: [row] }) } }),
    row => sweep({ ...base,
      db: { query: async () => ({ rows: [row] }) } }),
    row => list({ ...base,
      db: { query: async () => ({ rows: [row] }) } }),
  ];
  // Date.parse normalizes February 30 and accepts timezone offsets. Neither
  // can serve as an authenticated persisted recovery receipt.
  const invalidCommon = [
    { created_at: '2026-02-30T12:00:00Z' },
    { created_at: '2026-10-29T12:00:00-04:00' },
    { updated_at: '2026-02-30T12:04:00Z' },
    { updated_at: '2026-10-29T12:04:00+00:00' },
    { updated_at: '2026-10-29T12:04:00.1234Z' },
    { updated_at: new Date(NaN) },
    { updated_at: '2026-10-29T11:59:59Z' },
  ];
  for (const method of methods) {
    for (const overrides of invalidCommon) {
      await assert.rejects(method(quarantineRow(overrides)),
        /invalid (quarantine|recovery|reconciliation) timestamp/,
        JSON.stringify(overrides));
    }
  }
  for (const method of methods.slice(1)) {
    for (const dispatch_started_at of [
      '2026-02-30T12:02:00Z',
      '2026-10-29T12:02:00+00:00',
      '2026-10-29T12:02:00.1234Z',
      new Date(NaN),
    ]) {
      await assert.rejects(method(quarantineRow({ dispatch_started_at })),
        /invalid (recovery|reconciliation) timestamp/);
    }
  }
  const valid = quarantineRow({
    created_at: '2026-10-29T12:00:00Z',
    updated_at: '2026-10-29T12:04:00Z',
    dispatch_started_at: '2026-10-29T12:02:00Z',
  });
  for (const method of methods) {
    const result = await method(valid);
    const row = result.jobs?.[0] ?? (Array.isArray(result) ? result[0] : result);
    assert.equal(row.status, 'outcome_unknown');
    assert.equal(row.createdAt, '2026-10-29T12:00:00Z');
    assert.equal(row.updatedAt, '2026-10-29T12:04:00Z');
  }
});


test('ERP persisted Date receipts reject forged Date wrappers and ignore overridden instance methods', async () => {
  const { readErpOperationJobStatus } = await import('../server/services/erpJobReservation.js');
  const valid = new Date('2026-10-29T12:00:00Z');
  // A native Date may have own methods that lie about its timestamp. Read
  // the intrinsic Date slot rather than trusting either override.
  valid.getTime = () => NaN;
  valid.toISOString = () => '2099-01-01T00:00:00.000Z';
  const db = fakeDatabase();
  const query = db.query.bind(db);
  db.query = async (...params) => {
    const result = await query(...params);
    return { rows: result.rows.map(row => ({ ...row, created_at: valid })) };
  };
  const receipt = await reserve({ db, ...args });
  assert.equal(receipt.createdAt, '2026-10-29T12:00:00.000Z');

  const fake = Object.create(Date.prototype);
  fake.getTime = () => 0;
  fake.toISOString = () => '2026-10-29T12:00:00.000Z';
  const subclass = new (class extends Date {
    getTime() { return 0; }
    toISOString() { return '2026-10-29T12:00:00.000Z'; }
  })('2026-10-29T12:00:00Z');
  const proxy = new Proxy(new Date('2026-10-29T12:00:00Z'), {});
  const revoked = Proxy.revocable(new Date('2026-10-29T12:00:00Z'), {});
  revoked.revoke();

  for (const forged of [fake, subclass, proxy, revoked.proxy]) {
    const database = fakeDatabase();
    const original = database.query.bind(database);
    database.query = async (...params) => {
      const result = await original(...params);
      return { rows: result.rows.map(row => ({ ...row, created_at: forged })) };
    };
    await assert.rejects(reserve({ db: database, ...args }), /invalid creation timestamp/);
    await assert.rejects(readErpOperationJobStatus({
      authenticatedScope: scope, jobId: statusJobId,
      db: { query: async () => ({ rows: [{
        id: statusJobId, tenant_id: scope.tenantId, actor_id: scope.actorId,
        operation: 'invoice_delivery', status: 'queued',
        created_at: '2026-10-29T12:00:00Z', updated_at: forged,
      }] }) },
    }), /invalid status timestamp/);
  }
});


test('reservation rejects malformed Unicode before idempotency hashing or SQL', async () => {
  const db = fakeDatabase();
  // Distinct lone surrogates can both become U+FFFD when converted to UTF-8.
  // Never let a persisted idempotency key refer to a differently encoded
  // recipient, invoice ID, nested line item, or object field name.
  const invalidKey = { invoiceId: 'invoice-123' };
  invalidKey['reference\uD800'] = 'value';
  for (const payload of [
    { invoiceId: 'invoice-\uD800' },
    { invoiceId: 'invoice-\uDC00' },
    { invoiceId: 'invoice-123', recipient: { email: 'a\uD800@example.test' } },
    { invoiceId: 'invoice-123', lines: [{ label: '\uDC00' }] },
    invalidKey,
  ]) {
    await assert.rejects(reserve({ db, ...args, payload }), /malformed Unicode/);
  }
  assert.equal(db.calls, 0, 'malformed Unicode must not reach the database');

  // A correctly paired surrogate is a valid Unicode scalar value.
  const valid = await reserve({ db, ...args, payload: {
    invoiceId: 'invoice-\uD83D\uDE00', recipient: 'customer@example.test',
    lines: [{ description: 'repair \uD83D\uDE00' }],
  } });
  assert.equal(valid.created, true);
  assert.equal(db.calls, 1);
});


test('reservation rejects invisible accounting property names without blocking visible text', async () => {
  const db = fakeDatabase();
  // A visually disguised amountCents key must not bypass minor-unit
  // validation or enter the persisted idempotency fingerprint.
  const invalid = [
    { ['amount\u200bCents']: 125.5 },
    { ['amount\u202eCents']: 125.5 },
    { invoice: { lines: [{ ['fee\u200dCents']: 0.25 }] } },
    { ['recipient\nEmail']: 'member@example.test' },
    { ['memo\u0000']: 'hidden field' },
  ];
  for (const payload of invalid) {
    await assert.rejects(reserve({ db, ...args, payload }),
      /unsafe Unicode property name/);
  }
  assert.equal(db.calls, 0, 'invisible accounting keys must be rejected before SQL');

  // Unicode letters in property names and newlines in ordinary free-text
  // values remain valid, preserving legitimate international invoice notes.
  const result = await reserve({ db, ...args, payload: {
    invoiceId: 'invoice-123', 'référence': 'café',
    amountCents: 1250, note: 'Line one\nLine two',
  } });
  assert.equal(result.created, true);
  assert.equal(db.calls, 1);
});


test('snake_case minor-unit financial fields reject fractional and coerced values before database access', async () => {
  const db = fakeDatabase();
  for (const payload of [
    { amount_cents: 1.5 },
    { invoice: { lines: [{ line_total_minor: 99.99 }] } },
    { fee_cents: '125' },
    { balance_minor_units: null },
    { amount_minor: false },
    { adjustment_cents: -0 },
    { total_minor: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    await assert.rejects(
      reserve({ db, ...args, payload }),
      /invalid minor-unit amount|negative zero|unsafe integer/,
    );
  }
  assert.equal(db.calls, 0, 'invalid minor-unit amounts must not reach SQL');

  const accepted = await reserve({
    db, ...args,
    payload: {
      amount_cents: 1250,
      fee_cents: -15,
      invoice: { lines: [{ line_total_minor: 1265 }] },
      balance_minor_units: 0,
      tax_rate: 0.075,
    },
  });
  assert.equal(accepted.created, true);
  assert.equal(db.calls, 1);
});


test('ERP reservation and worker identity reject noncanonical Unicode before database access', async () => {
  // Canonically equivalent tenant/actor/worker labels must not create distinct
  // audit principals or worker leases. Valid composed international IDs remain
  // supported; no production identity provider or database is involved.
  const decomposed = 'cafe\u0301';
  const composed = 'caf\u00e9';
  assert.notEqual(decomposed, composed);
  let calls = 0;
  const db = { async query() { calls++; return { rows: [] }; } };
  for (const field of ['tenantId', 'actorId']) {
    await assert.rejects(reserve({
      db, ...args, authenticatedScope: { ...scope, [field]: decomposed },
    }), /Invalid authenticated/);
  }
  for (const field of ['tenantId', 'workerId']) {
    await assert.rejects(claim({
      db, authenticatedWorker: { ...workerScope, [field]: decomposed },
      operation: 'invoice_delivery',
    }), /Invalid authenticated/);
  }
  assert.equal(calls, 0, 'invalid identities must be rejected before SQL');
  assert.equal(await claim({
    db, authenticatedWorker: { tenantId: 'tenant-' + composed, workerId: 'worker-' + composed },
    operation: 'invoice_delivery',
  }), null);
  assert.equal(calls, 1, 'valid composed international identities reach SQL');
});


test('ERP accounting JSON keys require NFC without rejecting international labels or values', async () => {
  const db = fakeDatabase();
  const decomposed = 're\u0301fe\u0301rence';
  const composed = 'référence';
  assert.equal(decomposed.normalize('NFC'), composed);
  // A decomposed key may look identical to an approved accounting field but
  // would otherwise hash as a distinct JSON key and survive jsonb storage.
  for (const payload of [
    { [decomposed]: 'INV-123' },
    { invoice: { lines: [{ [decomposed]: 'line-ref' }] } },
    { [composed]: 'INV-123', [decomposed]: 'conflicting-value' },
  ]) {
    await assert.rejects(reserve({ db, ...args, payload }),
      /unsafe Unicode property name/);
  }
  assert.equal(db.calls, 0, 'non-NFC JSON keys must fail before SQL');
  const receipt = await reserve({ db, ...args, payload: {
    [composed]: 'cafe\u0301', invoice: { lines: [{ [composed]: 'café' }] },
  } });
  assert.equal(receipt.created, true);
  assert.equal(db.calls, 1, 'NFC international keys and free-text values remain supported');
});


test('reconciliation backlog refuses contradictory lease or failure metadata', async () => {
  // A quarantined outcome must have no worker lease and no terminal failure
  // code. Otherwise an inconsistent database row could appear to be safely
  // awaiting manual reconciliation, concealing an active worker or failure.
  const expectedColumns = ['failure_code', 'claimed_by', 'claimed_at', 'lease_expires_at'];
  let sqlText;
  const valid = await list({
    authenticatedWorker: workerScope, operation: 'invoice_delivery',
    db: { async query(sql) {
      sqlText = sql;
      return { rows: [quarantineRow()] };
    } },
  });
  assert.equal(valid.jobs.length, 1);
  for (const column of expectedColumns) {
    assert.match(sqlText, new RegExp('\\b' + column + '\\b'),
      'reconciliation SELECT must load ' + column);
  }
  for (const [field, value] of [
    ['failure_code', 'ERP_WORKER_ERROR'],
    ['claimed_by', 'worker-a'],
    ['claimed_at', new Date('2026-10-29T12:01:00Z')],
    ['lease_expires_at', new Date('2026-10-29T12:03:00Z')],
  ]) {
    await assert.rejects(list({
      authenticatedWorker: workerScope, operation: 'invoice_delivery',
      db: { query: async () => ({ rows: [quarantineRow({ [field]: value })] }) },
    }), /invalid tenant-bound reconciliation record/, field);
  }
});

test('single-job expired-lease recovery preserves dispatch evidence and rejects forged or missing fence data', async () => {
  const { quarantineExpiredErpOperationJob: quarantine } =
    await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope, operation: 'invoice_delivery',
    jobId: claimedJobId };
  let capturedSql;
  const dispatchStarted = new Date('2026-10-29T12:01:30Z');
  const receipt = await quarantine({ ...input, db: {
    async query(sql) {
      capturedSql = sql;
      return { rows: [quarantineRow({ dispatch_started_at: dispatchStarted })] };
    },
  } });
  assert.match(capturedSql, /RETURNING[\s\S]*dispatch_started_at/);
  assert.equal(receipt.dispatchStartedAt, '2026-10-29T12:01:30.000Z');
  assert.equal(receipt.status, 'outcome_unknown');
  assert.equal(receipt.requiresReconciliation, true);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal('delivered' in receipt, false);

  const undispatched = await quarantine({ ...input, db: {
    query: async () => ({ rows: [quarantineRow()] }),
  } });
  assert.equal(undispatched.dispatchStartedAt, null);
  assert.equal(undispatched.requiresReconciliation, true,
    'even an undispatched expired lease is never automatically retried');

  const missing = quarantineRow();
  delete missing.dispatch_started_at;
  await assert.rejects(quarantine({ ...input, db: {
    query: async () => ({ rows: [missing] }),
  } }), /invalid tenant-bound quarantine/,
  'missing dispatch evidence must not silently be treated as no dispatch');

  for (const dispatch_started_at of [
    'invalid', '2026-02-30T12:01:30Z',
    '2026-10-29T08:01:30-04:00',
    new Date('2026-10-29T11:59:59Z'),
    new Date('2026-10-29T12:05:00Z'),
  ]) {
    await assert.rejects(quarantine({ ...input, db: {
      query: async () => ({ rows: [quarantineRow({ dispatch_started_at })] }),
    } }), /invalid quarantine timestamp/,
    'invalid or out-of-order dispatch fence cannot be acknowledged');
  }
});


test('batch recovery and reconciliation backlog require explicit dispatch-fence evidence', async () => {
  // A missing or undefined dispatch_started_at must never be interpreted as
  // "no dispatch" after an expired lease. Either case could conceal a
  // previously attempted external delivery and encourage an unsafe retry.
  const { quarantineExpiredErpOperationJobsBatch: sweep } =
    await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  for (const [name, run] of [
    ['batch recovery', sweep],
    ['reconciliation backlog', list],
  ]) {
    let selectedSql = '';
    const valid = await run({
      ...input, db: { async query(sql) {
        selectedSql = sql;
        return { rows: [quarantineRow({ dispatch_started_at: null })] };
      } },
    });
    assert.match(selectedSql, /dispatch_started_at/, name + ' must select fence evidence');
    const record = Array.isArray(valid) ? valid[0] : valid.jobs[0];
    assert.equal(record.dispatchStartedAt, null);
    assert.equal(record.requiresReconciliation, true);
    assert.equal('delivered' in record, false);

    const missing = quarantineRow();
    delete missing.dispatch_started_at;
    await assert.rejects(run({
      ...input, db: { query: async () => ({ rows: [missing] }) },
    }), /invalid tenant-bound (recovery|reconciliation) record/,
    name + ' must reject absent fence column');

    await assert.rejects(run({
      ...input, db: { query: async () => ({
        rows: [quarantineRow({ dispatch_started_at: undefined })],
      }) },
    }), /invalid (recovery|reconciliation) timestamp/,
    name + ' must reject undefined fence values');
  }
});


test('batch recovery refuses noncanonical UUID receipts and case-aliased duplicates', async () => {
  const { quarantineExpiredErpOperationJobsBatch: sweep } =
    await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  const canonical = quarantineRow();
  const uppercase = { ...canonical, id: canonical.id.toUpperCase() };
  assert.notEqual(uppercase.id, canonical.id, 'fixture UUID must contain hex letters');
  for (const rows of [[uppercase], [canonical, uppercase], [uppercase, canonical]]) {
    await assert.rejects(sweep({ ...input, db: {
      query: async () => ({ rows }),
    } }), /invalid tenant-bound recovery record/,
    'a case alias must not be exposed as a separate quarantined job');
  }
  const valid = await sweep({ ...input, db: {
    query: async () => ({ rows: [canonical] }),
  } });
  assert.equal(valid.length, 1);
  assert.equal(valid[0].id, canonical.id);
  assert.equal(valid[0].requiresReconciliation, true);
});


test('recovery and reconciliation reject noncanonical persisted audit actors', async () => {
  // A stored actor is audit evidence, not an untrusted display label. Reject
  // misleading Unicode and boundary whitespace before exposing recovered jobs.
  const { quarantineExpiredErpOperationJobsBatch: sweep } =
    await import('../server/services/erpJobReservation.js');
  const input = { authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  const calls = [
    ['recovery', sweep, /invalid tenant-bound recovery record/],
    ['reconciliation', list, /invalid tenant-bound reconciliation record/],
  ];
  const invalidActors = [
    '', ' worker-a', 'worker-a ', 'worker\u202e-a',
    'cafe\u0301', 'x'.repeat(256), 'worker\u0000-a',
  ];
  for (const [label, run, expectedError] of calls) {
    for (const actor_id of invalidActors) {
      await assert.rejects(run({
        ...input,
        db: { query: async () => ({ rows: [quarantineRow({ actor_id })] }) },
      }), expectedError, label + ' must reject ambiguous persisted actor identity');
    }
    const result = await run({
      ...input,
      db: { query: async () => ({ rows: [quarantineRow({ actor_id: 'café' })] }) },
    });
    const record = Array.isArray(result) ? result[0] : result.jobs[0];
    assert.equal(record.requiresReconciliation, true);
    assert.equal(record.status, 'outcome_unknown');
  }
});


test('worker claim rejects noncanonical persisted actor and UUID receipts before dispatch', async () => {
  const input = { authenticatedWorker: workerScope, operation: 'invoice_delivery' };
  const invalid = [
    claimedRow({ actor_id: ' actor-a' }),
    claimedRow({ actor_id: 'actor-a ' }),
    claimedRow({ actor_id: 'actor\u200b-a' }),
    claimedRow({ actor_id: 'actor\u202e-a' }),
    claimedRow({ actor_id: 'cafe\u0301' }),
    claimedRow({ actor_id: 'x'.repeat(256) }),
    claimedRow({ actor_id: 'actor\ud800' }),
    claimedRow({ id: claimedJobId.toUpperCase() }),
  ];
  for (const row of invalid) {
    await assert.rejects(claim({
      ...input, db: { query: async () => ({ rows: [row] }) },
    }), /invalid tenant-bound worker claim/);
  }
  const receipt = await claim({
    ...input, db: { query: async () => ({ rows: [claimedRow({ actor_id: 'caf\u00e9' })] }) },
  });
  assert.equal(receipt.id, claimedJobId);
  assert.equal(receipt.status, 'processing');
  assert.equal('delivered' in receipt, false);
});
