import { createHash } from 'node:crypto';

// Database-backed reservation primitive. NOT connected to HTTP routes yet.
// The caller MUST authenticate the session and authorize the tenant, actor,
// entity and target record. Do not treat this as a delivery or payment receipt.
const operations = new Set([
  'invoice_delivery', 'invoice_export', 'statement_import', 'reconciliation_close',
]);

function requiredIdentifier(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 255) {
    throw new TypeError(`Invalid ${label}`);
  }
  return value;
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
  let record = insert.rows?.[0];
  const created = Boolean(record);
  if (!record) {
    const existing = await db.query(
      `SELECT id, tenant_id, actor_id, operation, idempotency_key,
              payload_sha256, status, created_at
       FROM erp_operation_jobs
       WHERE tenant_id = $1 AND operation = $2 AND idempotency_key = $3`,
      [tenantId, operation, idempotencyKey],
    );
    record = existing.rows?.[0];
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
      !['queued', 'processing', 'processed', 'sent', 'failed'].includes(record.status)) {
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
      !['queued', 'processing', 'processed', 'sent', 'failed'].includes(record.status)) {
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
