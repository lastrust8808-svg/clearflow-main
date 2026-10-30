import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';

// Database-backed reservation primitive. NOT connected to HTTP routes yet.
// Until independently verified durable completion evidence is persisted, no
// successful terminal state ('sent'/'processed') may be acknowledged.
// The caller MUST authenticate the session and authorize the tenant, actor,
// entity and target record. Do not treat this as a delivery or payment receipt.
const operations = new Set([
  'invoice_delivery', 'invoice_export', 'statement_import', 'reconciliation_close',
]);

// Authenticated identity fields must not contain invisible controls, bidi
// overrides, malformed surrogate code units or boundary whitespace. These can
// make distinct tenant/actor/worker identities appear identical in audits.
function requiredIdentifier(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 255 ||
      value !== value.trim() || /[\\p{Cc}\\p{Cf}\\p{Cs}]/u.test(value)) {
    throw new TypeError(`Invalid ${label}`);
  }
  return value;
}

// Reject values that JSON.stringify silently drops or coerces. In an accounting
// operation, { amount: NaN } must never become { amount: null }, and a missing
// recipient must not hash identically to a deliberately omitted field.
// Only explicit, plain JSON data is accepted; no getters or custom toJSON.
function assertJsonSafe(value, seen = new WeakSet(), depth = 0) {
  if (depth > 32) throw new TypeError('ERP job payload nesting limit exceeded');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('ERP job payload contains a non-finite number');
    return;
  }
  if (typeof value !== 'object') throw new TypeError('ERP job payload contains a non-JSON value');
  // Proxy traps can mutate values or execute code during descriptor inspection
  // and JSON.stringify. Reject them before any property reflection or access.
  if (nodeTypes.isProxy(value)) throw new TypeError('ERP job payload contains a Proxy');
  if (seen.has(value)) throw new TypeError('ERP job payload contains a circular or shared reference');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) {
    throw new TypeError('ERP job payload must contain plain JSON objects');
  }
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key === 'symbol')) {
    throw new TypeError('ERP job payload contains a symbol property');
  }
  if (Array.isArray(value)) {
    for (const key of Object.keys(descriptors)) {
      if (key !== 'length' && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
        throw new TypeError('ERP job payload contains an ignored array property');
      }
    }
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(descriptors, i)) throw new TypeError('ERP job payload contains a sparse array');
      const descriptor = descriptors[i];
      if (!Object.hasOwn(descriptor, 'value')) throw new TypeError('ERP job payload contains an accessor');
      assertJsonSafe(descriptor.value, seen, depth + 1);
    }
  } else {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      // JSON.stringify silently omits non-enumerable object properties.
      // Reject them rather than hashing/storing a different financial payload.
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable ||
          ['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key)) {
        throw new TypeError('ERP job payload contains an unsafe property');
      }
      assertJsonSafe(descriptor.value, seen, depth + 1);
    }
  }
  seen.delete(value);
}

export async function reserveErpOperationJob({
  db, authenticatedScope, operation, idempotencyKey, payload,
}) {
  if (!db || typeof db.query !== 'function') throw new TypeError('Database connection required');
  const tenantId = requiredIdentifier(authenticatedScope?.tenantId, 'authenticated tenant');
  const actorId = requiredIdentifier(authenticatedScope?.actorId, 'authenticated actor');
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw new TypeError('Invalid idempotency key');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('ERP job payload must be an object');
  }
  assertJsonSafe(payload);
  const json = JSON.stringify(payload);
  if (typeof json !== 'string' || Buffer.byteLength(json) > 65536) {
    throw new TypeError('ERP job payload is invalid or too large');
  }
  const digest = createHash('sha256').update(json).digest('hex');
  // The unique constraint arbitrates concurrent inserts across API workers.
  // No process-local queue or success-on-DB-failure fallback is permitted.
  const insert = await db.query(
    `INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING
     RETURNING id, tenant_id, actor_id, operation, idempotency_key,
               payload_sha256, status, created_at`,
    [tenantId, actorId, operation, idempotencyKey, digest, json],
  );
  if (!Array.isArray(insert?.rows) || insert.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid reservation result');
  }
  let record = insert.rows[0];
  const created = Boolean(record);
  if (!record) {
    const existing = await db.query(
      `SELECT id, tenant_id, actor_id, operation, idempotency_key,
              payload_sha256, status, created_at
       FROM erp_operation_jobs
       WHERE tenant_id = $1 AND operation = $2 AND idempotency_key = $3`,
      [tenantId, operation, idempotencyKey],
    );
    if (!Array.isArray(existing?.rows) || existing.rows.length > 1) {
      throw new Error('ERP job storage returned an invalid reservation lookup');
    }
    record = existing.rows[0];
    if (!record) throw new Error('ERP job reservation could not be verified');
    if (record.actor_id !== actorId || record.payload_sha256 !== digest) {
      const error = new Error('ERP idempotency key conflicts with an existing job');
      error.code = 'ERP_IDEMPOTENCY_CONFLICT';
      throw error;
    }
  }
  if (record.tenant_id !== tenantId || record.actor_id !== actorId ||
      record.operation !== operation || record.idempotency_key !== idempotencyKey ||
      record.payload_sha256 !== digest) {
    throw new Error('ERP job storage returned an invalid tenant-bound receipt');
  }
  if (typeof record.id !== 'string' || !record.id ||
      !['queued', 'processing', 'failed', 'outcome_unknown'].includes(record.status)) {
    throw new Error('ERP job storage returned an invalid job record');
  }
  const createdAt = record.created_at instanceof Date
    ? record.created_at.toISOString() : record.created_at;
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error('ERP job storage returned an invalid creation timestamp');
  }
  return Object.freeze({
    id: record.id, tenantId, operation, status: record.status,
    createdAt, created, replayed: !created,
  });
}


// Read-only status lookup. Authentication and authorization must be established
// by the caller; this helper additionally scopes every read to tenant + actor.
// A returned status is NOT proof that an email was delivered or funds moved.
export async function readErpOperationJobStatus({ db, authenticatedScope, jobId }) {
  if (!db || typeof db.query !== 'function') throw new TypeError('Database connection required');
  const tenantId = requiredIdentifier(authenticatedScope?.tenantId, 'authenticated tenant');
  const actorId = requiredIdentifier(authenticatedScope?.actorId, 'authenticated actor');
  if (typeof jobId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new TypeError('Invalid ERP job id');
  }
  const result = await db.query(
    `SELECT id, tenant_id, actor_id, operation, status, created_at, updated_at
     FROM erp_operation_jobs
     WHERE tenant_id = $1 AND actor_id = $2 AND id = $3`,
    [tenantId, actorId, jobId],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid status result');
  }
  const record = result.rows[0];
  if (!record) return null;
  if (record.id !== jobId || record.tenant_id !== tenantId ||
      record.actor_id !== actorId || !operations.has(record.operation) ||
      !['queued', 'processing', 'failed', 'outcome_unknown'].includes(record.status)) {
    throw new Error('ERP job storage returned an invalid tenant-bound status');
  }
  const createdAt = record.created_at instanceof Date
    ? record.created_at.toISOString() : record.created_at;
  const updatedAt = record.updated_at instanceof Date
    ? record.updated_at.toISOString() : record.updated_at;
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt)) ||
      typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error('ERP job storage returned an invalid status timestamp');
  }
  return Object.freeze({
    id: jobId, tenantId, operation: record.operation,
    status: record.status, createdAt, updatedAt,
  });
}


// Atomically claim ONE queued job for an independently authenticated worker.
// This helper does not execute the job, send mail, or move funds. The worker
// must be authorized to process this tenant and operation before invocation.
// Expired leases must be recovered by a separately reviewed recovery gate.
export async function claimErpOperationJob({
  db, authenticatedWorker, operation, leaseSeconds = 60,
}) {
  if (!db || typeof db.query !== 'function') throw new TypeError('Database connection required');
  const tenantId = requiredIdentifier(authenticatedWorker?.tenantId, 'authenticated tenant');
  const workerId = requiredIdentifier(authenticatedWorker?.workerId, 'authenticated worker');
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 300) {
    throw new TypeError('Invalid ERP worker lease');
  }
  // One SQL statement provides an atomic claim even with concurrent workers.
  // SKIP LOCKED prevents two workers claiming the same queued row.
  const result = await db.query(
    `WITH next_job AS (
       SELECT id FROM erp_operation_jobs
       WHERE tenant_id = $1 AND operation = $2 AND status = 'queued'
       ORDER BY created_at, id
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE erp_operation_jobs AS job
     SET status = 'processing', claimed_by = $3, claimed_at = now(),
         lease_expires_at = now() + ($4 * interval '1 second'),
         updated_at = now()
     FROM next_job
     WHERE job.id = next_job.id AND job.tenant_id = $1
       AND job.operation = $2 AND job.status = 'queued'
     RETURNING job.id, job.tenant_id, job.actor_id, job.operation,
               job.status, job.claimed_by, job.claimed_at,
               job.lease_expires_at, job.created_at, job.updated_at`,
    [tenantId, operation, workerId, leaseSeconds],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid worker claim');
  }
  const record = result.rows[0];
  if (!record) return null;
  if (typeof record.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.id) ||
      record.tenant_id !== tenantId || record.operation !== operation ||
      record.claimed_by !== workerId || record.status !== 'processing' ||
      typeof record.actor_id !== 'string' || !record.actor_id) {
    throw new Error('ERP job storage returned an invalid tenant-bound worker claim');
  }
  const timestamp = (value) => value instanceof Date ? value.toISOString() : value;
  const claimedAt = timestamp(record.claimed_at);
  const leaseExpiresAt = timestamp(record.lease_expires_at);
  const createdAt = timestamp(record.created_at);
  const updatedAt = timestamp(record.updated_at);
  if ([claimedAt, leaseExpiresAt, createdAt, updatedAt].some(
    (value) => typeof value !== 'string' || !Number.isFinite(Date.parse(value))
  ) || Date.parse(leaseExpiresAt) <= Date.parse(claimedAt) ||
       Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new Error('ERP job storage returned an invalid worker lease timestamp');
  }
  return Object.freeze({
    id: record.id, tenantId, operation, status: 'processing',
    claimedBy: workerId, claimedAt, leaseExpiresAt,
    createdAt, updatedAt,
  });
}

// Extend only a still-valid, exclusively owned worker lease. This helper does
// not execute work, retry expired jobs, or represent provider delivery.
// Caller MUST authenticate and authorize the worker's tenant/operation.
export async function renewErpOperationJobLease({
  db, authenticatedWorker, operation, jobId, leaseSeconds = 60,
}) {
  if (!db || typeof db.query !== 'function') throw new TypeError('Database connection required');
  const tenantId = requiredIdentifier(authenticatedWorker?.tenantId, 'authenticated tenant');
  const workerId = requiredIdentifier(authenticatedWorker?.workerId, 'authenticated worker');
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (typeof jobId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new TypeError('Invalid ERP job id');
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 300) {
    throw new TypeError('Invalid ERP worker lease');
  }
  // Compare-and-swap in one SQL statement: no resurrection of an expired
  // lease, no takeover by another worker, and no renewal of a finished job.
  const result = await db.query(
    `UPDATE erp_operation_jobs
     SET lease_expires_at = GREATEST(lease_expires_at, now() + ($5 * interval '1 second')),
         updated_at = now()
     WHERE tenant_id = $1 AND operation = $2 AND id = $3
       AND claimed_by = $4 AND status = 'processing'
       AND lease_expires_at > now()
     RETURNING id, tenant_id, actor_id, operation, status, claimed_by,
               claimed_at, lease_expires_at, created_at, updated_at`,
    [tenantId, operation, jobId, workerId, leaseSeconds],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid lease renewal result');
  }
  const record = result.rows[0];
  if (!record) return null;
  if (record.id !== jobId || record.tenant_id !== tenantId ||
      record.operation !== operation || record.status !== 'processing' ||
      record.claimed_by !== workerId || typeof record.actor_id !== 'string' ||
      !record.actor_id) {
    throw new Error('ERP job storage returned an invalid tenant-bound lease renewal');
  }
  const stamp = value => value instanceof Date ? value.toISOString() : value;
  const claimedAt = stamp(record.claimed_at);
  const leaseExpiresAt = stamp(record.lease_expires_at);
  const updatedAt = stamp(record.updated_at);
  const createdAt = stamp(record.created_at);
  if ([claimedAt, leaseExpiresAt, updatedAt, createdAt].some(
    value => typeof value !== 'string' || !Number.isFinite(Date.parse(value))
  ) || Date.parse(leaseExpiresAt) <= Date.parse(claimedAt) ||
       Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new Error('ERP job storage returned an invalid lease renewal timestamp');
  }
  return Object.freeze({
    id: jobId, tenantId, operation, status: 'processing',
    claimedBy: workerId, claimedAt, leaseExpiresAt, updatedAt,
  });
}


// Persist a pre-dispatch fence BEFORE calling any external provider or mailer.
// A timeout after this point has an unknown outcome, not a confirmed failure.
// This is NOT evidence of provider delivery, settlement, or successful export.
// Caller MUST authenticate and authorize the worker/tenant/operation.
export async function markErpOperationJobDispatchStarted({
  db, authenticatedWorker, operation, jobId,
}) {
  if (!db || typeof db.query !== 'function') throw new TypeError('Database connection required');
  const tenantId = requiredIdentifier(authenticatedWorker?.tenantId, 'authenticated tenant');
  const workerId = requiredIdentifier(authenticatedWorker?.workerId, 'authenticated worker');
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (typeof jobId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new TypeError('Invalid ERP job id');
  }
  // The atomic fence can be recorded only once, by the owning worker while
  // its processing lease is still valid. No fallback when storage fails.
  const result = await db.query(
    `UPDATE erp_operation_jobs
     SET dispatch_started_at = now(), updated_at = now()
     WHERE tenant_id = $1 AND operation = $2 AND id = $3
       AND claimed_by = $4 AND status = 'processing'
       AND lease_expires_at > now() AND dispatch_started_at IS NULL
     RETURNING id, tenant_id, actor_id, operation, status, claimed_by,
               claimed_at, dispatch_started_at, lease_expires_at,
               created_at, updated_at`,
    [tenantId, operation, jobId, workerId],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid dispatch fence result');
  }
  const row = result.rows[0];
  if (!row) return null;
  if (row.id !== jobId || row.tenant_id !== tenantId ||
      row.operation !== operation || row.status !== 'processing' ||
      row.claimed_by !== workerId || typeof row.actor_id !== 'string' ||
      !row.actor_id) {
    throw new Error('ERP job storage returned an invalid tenant-bound dispatch fence');
  }
  const stamp = value => value instanceof Date ? value.toISOString() : value;
  const createdAt = stamp(row.created_at);
  const claimedAt = stamp(row.claimed_at);
  const dispatchStartedAt = stamp(row.dispatch_started_at);
  const leaseExpiresAt = stamp(row.lease_expires_at);
  const updatedAt = stamp(row.updated_at);
  if ([createdAt, claimedAt, dispatchStartedAt, leaseExpiresAt, updatedAt].some(
    value => typeof value !== 'string' || !Number.isFinite(Date.parse(value))
  ) || Date.parse(createdAt) > Date.parse(claimedAt) ||
       Date.parse(dispatchStartedAt) < Date.parse(claimedAt) ||
       Date.parse(dispatchStartedAt) >= Date.parse(leaseExpiresAt) ||
       Date.parse(updatedAt) < Date.parse(dispatchStartedAt)) {
    throw new Error('ERP job storage returned an invalid dispatch fence timestamp');
  }
  return Object.freeze({
    id: jobId, tenantId, operation, status: 'processing',
    dispatchStartedAt, leaseExpiresAt, updatedAt,
    outcomeMayBeUnknown: true,
  });
}


// Terminal failure is a durable status transition, NOT an acknowledgement of
// invoice delivery or financial settlement. The worker must have trusted
// tenant/operation authorization before calling this function.
const failureCodes = new Set([
  'ERP_WORKER_ERROR', 'ERP_PROVIDER_REJECTED',
  'ERP_VALIDATION_REJECTED', 'ERP_RETRY_EXHAUSTED',
]);

export async function failErpOperationJob({
  db, authenticatedWorker, operation, jobId, failureCode,
}) {
  if (!db || typeof db.query !== 'function') throw new TypeError('Database connection required');
  const tenantId = requiredIdentifier(authenticatedWorker?.tenantId, 'authenticated tenant');
  const workerId = requiredIdentifier(authenticatedWorker?.workerId, 'authenticated worker');
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (typeof jobId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new TypeError('Invalid ERP job id');
  }
  if (!failureCodes.has(failureCode)) throw new TypeError('Invalid ERP failure code');

  // Atomic compare-and-swap: only the current worker holding a live lease
  // may persist a terminal failure. Never requeue, dispatch, or report sent.
  const result = await db.query(
    `UPDATE erp_operation_jobs
     SET status = 'failed', failure_code = $5,
         claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL,
         updated_at = now()
     WHERE tenant_id = $1 AND operation = $2 AND id = $3
       AND claimed_by = $4 AND status = 'processing'
       AND lease_expires_at > now() AND dispatch_started_at IS NULL
     RETURNING id, tenant_id, actor_id, operation, status, failure_code,
               claimed_by, claimed_at, lease_expires_at, created_at, updated_at`,
    [tenantId, operation, jobId, workerId, failureCode],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid failure result');
  }
  const record = result.rows[0];
  if (!record) return null;
  if (record.id !== jobId || record.tenant_id !== tenantId ||
      record.operation !== operation || record.status !== 'failed' ||
      record.failure_code !== failureCode ||
      record.claimed_by != null || record.claimed_at != null ||
      record.lease_expires_at != null ||
      typeof record.actor_id !== 'string' || !record.actor_id) {
    throw new Error('ERP job storage returned an invalid tenant-bound failure');
  }
  const stamp = value => value instanceof Date ? value.toISOString() : value;
  const createdAt = stamp(record.created_at);
  const updatedAt = stamp(record.updated_at);
  if ([createdAt, updatedAt].some(
    value => typeof value !== 'string' || !Number.isFinite(Date.parse(value))
  ) || Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new Error('ERP job storage returned an invalid failure timestamp');
  }
  return Object.freeze({
    id: jobId, tenantId, operation, status: 'failed',
    failureCode, createdAt, updatedAt,
  });
}


// An expired worker lease does not prove an external side effect failed.
// Quarantine for reconciliation; never retry, requeue or claim delivery here.
// Caller MUST independently authenticate and authorize recovery worker scope.
export async function quarantineExpiredErpOperationJob({
  db, authenticatedWorker, operation, jobId,
}) {
  if (!db || typeof db.query !== 'function') throw new TypeError('Database connection required');
  const tenantId = requiredIdentifier(authenticatedWorker?.tenantId, 'authenticated tenant');
  requiredIdentifier(authenticatedWorker?.workerId, 'authenticated worker');
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (typeof jobId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new TypeError('Invalid ERP job id');
  }
  const result = await db.query(
    `UPDATE erp_operation_jobs
     SET status = 'outcome_unknown',
         claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL,
         updated_at = now()
     WHERE tenant_id = $1 AND operation = $2 AND id = $3
       AND status = 'processing' AND lease_expires_at <= now()
     RETURNING id, tenant_id, actor_id, operation, status, failure_code,
               claimed_by, claimed_at, lease_expires_at, created_at, updated_at`,
    [tenantId, operation, jobId],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid quarantine result');
  }
  const row = result.rows[0];
  if (!row) return null;
  if (row.id !== jobId || row.tenant_id !== tenantId ||
      row.operation !== operation || row.status !== 'outcome_unknown' ||
      row.failure_code != null || row.claimed_by != null ||
      row.claimed_at != null || row.lease_expires_at != null ||
      typeof row.actor_id !== 'string' || !row.actor_id) {
    throw new Error('ERP job storage returned an invalid tenant-bound quarantine');
  }
  const stamp = value => value instanceof Date ? value.toISOString() : value;
  const createdAt = stamp(row.created_at), updatedAt = stamp(row.updated_at);
  if ([createdAt, updatedAt].some(
    value => typeof value !== 'string' || !Number.isFinite(Date.parse(value))
  ) || Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new Error('ERP job storage returned an invalid quarantine timestamp');
  }
  return Object.freeze({
    id: jobId, tenantId, operation, status: 'outcome_unknown',
    requiresReconciliation: true, createdAt, updatedAt,
  });
}


// Restart-recovery safety gate: atomically quarantine a bounded batch of
// expired processing leases. A lease timeout is NOT evidence of provider
// failure; every selected job becomes outcome_unknown, never queued/failed.
// The caller MUST independently authenticate and authorize this worker for
// the tenant and operation. No provider action or automatic retry occurs.
export async function quarantineExpiredErpOperationJobsBatch({
  db, authenticatedWorker, operation, maxJobs = 25,
}) {
  if (!db || typeof db.query !== 'function') throw new TypeError('Database connection required');
  const tenantId = requiredIdentifier(authenticatedWorker?.tenantId, 'authenticated tenant');
  requiredIdentifier(authenticatedWorker?.workerId, 'authenticated worker');
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 100) {
    throw new TypeError('Invalid ERP recovery batch size');
  }
  // SKIP LOCKED lets concurrent recovery workers partition expired leases.
  // The second status/expiry predicate prevents races with lease renewal.
  const result = await db.query(
    `WITH expired AS (
       SELECT id FROM erp_operation_jobs
       WHERE tenant_id = $1 AND operation = $2 AND status = 'processing'
         AND lease_expires_at <= now()
       ORDER BY lease_expires_at, id
       FOR UPDATE SKIP LOCKED LIMIT $3
     )
     UPDATE erp_operation_jobs AS job
     SET status = 'outcome_unknown',
         claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL,
         updated_at = now()
     FROM expired
     WHERE job.id = expired.id AND job.tenant_id = $1
       AND job.operation = $2 AND job.status = 'processing'
       AND job.lease_expires_at <= now()
     RETURNING job.id, job.tenant_id, job.actor_id, job.operation,
               job.status, job.failure_code, job.claimed_by,
               job.claimed_at, job.lease_expires_at,
               job.dispatch_started_at, job.created_at, job.updated_at`,
    [tenantId, operation, maxJobs],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > maxJobs) {
    throw new Error('ERP job storage returned an invalid recovery batch');
  }
  const seenIds = new Set();
  const quarantined = result.rows.map(row => {
    if (!row || typeof row.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id) ||
        seenIds.has(row.id) || row.tenant_id !== tenantId ||
        row.operation !== operation || row.status !== 'outcome_unknown' ||
        typeof row.actor_id !== 'string' || !row.actor_id ||
        row.failure_code != null || row.claimed_by != null ||
        row.claimed_at != null || row.lease_expires_at != null) {
      throw new Error('ERP job storage returned an invalid tenant-bound recovery record');
    }
    seenIds.add(row.id);
    const stamp = value => value instanceof Date ? value.toISOString() : value;
    const createdAt = stamp(row.created_at), updatedAt = stamp(row.updated_at);
    const dispatchStartedAt = row.dispatch_started_at == null
      ? null : stamp(row.dispatch_started_at);
    if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt)) ||
        typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt)) ||
        Date.parse(updatedAt) < Date.parse(createdAt) ||
        (dispatchStartedAt !== null &&
         (typeof dispatchStartedAt !== 'string' ||
          !Number.isFinite(Date.parse(dispatchStartedAt)) ||
          Date.parse(dispatchStartedAt) < Date.parse(createdAt) ||
          Date.parse(dispatchStartedAt) > Date.parse(updatedAt)))) {
      throw new Error('ERP job storage returned an invalid recovery timestamp');
    }
    return Object.freeze({
      id: row.id, tenantId, operation, status: 'outcome_unknown',
      requiresReconciliation: true, dispatchStartedAt, createdAt, updatedAt,
    });
  });
  return Object.freeze(quarantined);
}


// Read-only, bounded reconciliation backlog for independently authenticated
// tenant-authorized recovery workers. Quarantined jobs must be investigated,
// never automatically retried or reported delivered. No payload, recipient,
// or financial details are returned by this helper.
// UUID keyset pagination avoids lossy timestamp cursors (PostgreSQL stores
// microseconds; JavaScript Date ordinarily preserves only milliseconds).
export async function listErpOperationJobsNeedingReconciliation({
  db, authenticatedWorker, operation, maxJobs = 25, afterJobId = null,
}) {
  if (!db || typeof db.query !== 'function') throw new TypeError('Database connection required');
  const tenantId = requiredIdentifier(authenticatedWorker?.tenantId, 'authenticated tenant');
  requiredIdentifier(authenticatedWorker?.workerId, 'authenticated worker');
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 100) {
    throw new TypeError('Invalid ERP reconciliation page size');
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (afterJobId !== null && (typeof afterJobId !== 'string' || !uuid.test(afterJobId))) {
    throw new TypeError('Invalid ERP reconciliation cursor');
  }
  const cursor = afterJobId === null ? null : afterJobId.toLowerCase();
  const result = await db.query(
    `SELECT id, tenant_id, actor_id, operation, status,
            dispatch_started_at, created_at, updated_at
     FROM erp_operation_jobs
     WHERE tenant_id = $1 AND operation = $2 AND status = 'outcome_unknown'
       AND ($4::uuid IS NULL OR id > $4::uuid)
     ORDER BY id ASC LIMIT $3`,
    [tenantId, operation, maxJobs, cursor],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > maxJobs) {
    throw new Error('ERP job storage returned an invalid reconciliation backlog');
  }
  let previousId = cursor;
  const jobs = result.rows.map(row => {
    if (!row || typeof row.id !== 'string' || !uuid.test(row.id) ||
        row.id !== row.id.toLowerCase() ||
        (previousId !== null && row.id <= previousId) ||
        row.tenant_id !== tenantId || row.operation !== operation ||
        row.status !== 'outcome_unknown' ||
        typeof row.actor_id !== 'string' || !row.actor_id) {
      throw new Error('ERP job storage returned an invalid tenant-bound reconciliation record');
    }
    previousId = row.id;
    const stamp = value => value instanceof Date ? value.toISOString() : value;
    const createdAt = stamp(row.created_at), updatedAt = stamp(row.updated_at);
    const dispatchStartedAt = row.dispatch_started_at == null
      ? null : stamp(row.dispatch_started_at);
    if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt)) ||
        typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt)) ||
        Date.parse(updatedAt) < Date.parse(createdAt) ||
        (dispatchStartedAt !== null &&
         (typeof dispatchStartedAt !== 'string' ||
          !Number.isFinite(Date.parse(dispatchStartedAt)) ||
          Date.parse(dispatchStartedAt) < Date.parse(createdAt) ||
          Date.parse(dispatchStartedAt) > Date.parse(updatedAt)))) {
      throw new Error('ERP job storage returned an invalid reconciliation timestamp');
    }
    return Object.freeze({
      id: row.id, tenantId, operation, status: 'outcome_unknown',
      requiresReconciliation: true, dispatchStartedAt, createdAt, updatedAt,
    });
  });
  return Object.freeze({
    jobs: Object.freeze(jobs),
    nextAfterJobId: jobs.length === maxJobs ? jobs[jobs.length - 1].id : null,
  });
}
