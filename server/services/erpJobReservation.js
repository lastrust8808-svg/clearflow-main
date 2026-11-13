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
// overrides, malformed surrogate code units, noncanonical Unicode or boundary whitespace. These can
// make distinct tenant/actor/worker identities appear identical in audits.
function isCanonicalIdentifier(value) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= 255 &&
    value === value.trim() && value === value.normalize('NFC') &&
    !/[\p{Cc}\p{Cf}\p{Cs}\p{Zs}\p{Zl}\p{Zp}]/u.test(value) &&
    !/\p{Default_Ignorable_Code_Point}/u.test(value) &&
    ![...value].some(char => {
      const cp = char.codePointAt(0);
      return (cp >= 0xfdd0 && cp <= 0xfdef) ||
        (cp >= 0xfffe && (cp & 0xffff) >= 0xfffe);
    });
}

function requiredIdentifier(value, label) {
  if (!isCanonicalIdentifier(value)) throw new TypeError(`Invalid ${label}`);
  return value;
}

// A tenant/actor claim is only a trusted input after the caller authenticates
// it. Reject inherited, accessor-backed, hidden and Proxy identity records
// before reading any field; otherwise an apparent tenant binding can be
// supplied by JavaScript prototype state rather than an explicit auth result.
function authenticatedActorIdentity(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || nodeTypes.isProxy(scope)) {
    throw new TypeError('Authenticated ERP scope must be a plain data record');
  }
  const prototype = Object.getPrototypeOf(scope);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Authenticated ERP scope must be a plain data record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(scope);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('Authenticated ERP scope contains an unsafe property');
    }
  }
  if (!Object.hasOwn(descriptors, 'tenantId') || !Object.hasOwn(descriptors, 'actorId')) {
    throw new TypeError('Authenticated ERP scope is missing an own identity');
  }
  return {
    tenantId: requiredIdentifier(descriptors.tenantId.value, 'authenticated tenant'),
    actorId: requiredIdentifier(descriptors.actorId.value, 'authenticated actor'),
  };
}

// A worker identity must be an explicit authenticated data record. Never
// accept inherited tenant/worker IDs, getters, or Proxy traps as authorization
// for claiming, renewing, failing, or quarantining durable ERP jobs.
function authenticatedWorkerIdentity(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || nodeTypes.isProxy(scope)) {
    throw new TypeError('Authenticated ERP worker must be a plain data record');
  }
  const prototype = Object.getPrototypeOf(scope);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Authenticated ERP worker must be a plain data record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(scope);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('Authenticated ERP worker contains an unsafe property');
    }
  }
  if (!Object.hasOwn(descriptors, 'tenantId') || !Object.hasOwn(descriptors, 'workerId')) {
    throw new TypeError('Authenticated ERP worker is missing an own identity');
  }
  return {
    tenantId: requiredIdentifier(descriptors.tenantId.value, 'authenticated tenant'),
    workerId: requiredIdentifier(descriptors.workerId.value, 'authenticated worker'),
  };
}

// Reject values that JSON.stringify silently drops or coerces. In an accounting
// operation, { amount: NaN } must never become { amount: null }, and a missing
// recipient must not hash identically to a deliberately omitted field.
// Only explicit, plain JSON data is accepted; no getters or custom toJSON.
function assertJsonSafe(value, seen = new WeakSet(), depth = 0, budget = { remaining: 20000 }) {
  if (--budget.remaining < 0) throw new TypeError('ERP job payload aggregate traversal limit exceeded');
  if (depth > 32) throw new TypeError('ERP job payload nesting limit exceeded');
  if (value === null || typeof value === 'boolean') return;
  // Lone UTF-16 surrogates are not Unicode scalar values. Downstream UTF-8
  // encoders replace them with U+FFFD, potentially changing recipient or
  // invoice identities after the idempotency digest was persisted.
  if (typeof value === 'string') {
    if (value.length > 65536) throw new TypeError('ERP job payload string length limit exceeded');
    if (/\p{Cs}/u.test(value)) throw new TypeError('ERP job payload contains malformed Unicode');
    if ([...value].some(char => {
      const cp = char.codePointAt(0);
      return (cp >= 0xfdd0 && cp <= 0xfdef) ||
        (cp >= 0xfffe && (cp & 0xffff) >= 0xfffe);
    })) throw new TypeError('ERP job payload contains a Unicode noncharacter');
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('ERP job payload contains a non-finite number');
    // JSON.stringify(-0) becomes 0, collapsing distinct caller-supplied
    // financial representations into the same idempotency fingerprint.
    if (Object.is(value, -0)) throw new TypeError('ERP job payload contains negative zero');
    // JSON numbers above the safe-integer boundary may already have rounded
    // before serialization. Never reserve an accounting job with ambiguous
    // integer amounts, counts, or minor-unit balances.
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError('ERP job payload contains an unsafe integer');
    }
    return;
  }
  if (typeof value !== 'object') throw new TypeError('ERP job payload contains a non-JSON value');
  // Proxy traps can mutate values or execute code during descriptor inspection
  // and JSON.stringify. Reject them before any property reflection or access.
  if (nodeTypes.isProxy(value)) throw new TypeError('ERP job payload contains a Proxy');
  if (seen.has(value)) throw new TypeError('ERP job payload contains a circular or shared reference');
  // JSON.stringify invokes inherited toJSON hooks before hashing. A custom
  // array prototype can rewrite invoice lines without an own property, and
  // polluted built-in prototypes can rewrite otherwise plain payloads.
  // Reject those hooks before any database reservation is acknowledged.
  if (Object.hasOwn(Object.prototype, 'toJSON') ||
      Object.hasOwn(Array.prototype, 'toJSON')) {
    throw new TypeError('ERP job payload inherits a JSON serializer hook');
  }
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) {
      throw new TypeError('ERP job payload contains an unsafe array prototype');
    }
  } else if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('ERP job payload must contain plain JSON objects');
  }
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key === 'symbol')) {
    throw new TypeError('ERP job payload contains a symbol property');
  }
  if (Array.isArray(value)) {
    // Bound validation work before iterating a caller-controlled line-item array.
    // The byte limit is checked after canonicalization, so it cannot protect
    // against excessive sparse/dense array traversal on its own.
    if (value.length > 10000) {
      throw new TypeError('ERP job payload array length limit exceeded');
    }
    for (const key of Object.keys(descriptors)) {
      if (key !== 'length' && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
        throw new TypeError('ERP job payload contains an ignored array property');
      }
    }
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(descriptors, i)) throw new TypeError('ERP job payload contains a sparse array');
      const descriptor = descriptors[i];
      if (!Object.hasOwn(descriptor, 'value')) throw new TypeError('ERP job payload contains an accessor');
      assertJsonSafe(descriptor.value, seen, depth + 1, budget);
    }
  } else {
    // Bound descriptor traversal before canonical hashing or SQL. A very wide
    // object can exhaust CPU even when its serialized byte count is rejected.
    if (Object.keys(descriptors).length > 10000) {
      throw new TypeError('ERP job payload object property count limit exceeded');
    }
    for (const [key, descriptor] of Object.entries(descriptors)) {
      // JSON.stringify silently omits non-enumerable object properties.
      // Reject them rather than hashing/storing a different financial payload.
      // Invisible controls, Unicode spacing and bidi formatting in JSON field names can
      // disguise financial keys (for example amountCents with a zero-width
      // character), bypassing the minor-unit type guard and misleading audits.
      // Free-text VALUES may still contain ordinary newlines; only object
      // property names are required to be visible, canonical field labels.
      if (key.length > 1024) {
        throw new TypeError('ERP job payload property name length limit exceeded');
      }
      if (/\p{Cs}/u.test(key)) {
        throw new TypeError('ERP job payload contains malformed Unicode');
      }
      if (!key || /[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}]/u.test(key) ||
          /\p{Default_Ignorable_Code_Point}/u.test(key) || key !== key.normalize('NFC') ||
          [...key].some(char => {
            const cp = char.codePointAt(0);
            return (cp >= 0xfdd0 && cp <= 0xfdef) ||
              (cp >= 0xfffe && (cp & 0xffff) >= 0xfffe);
          })) {
        // Canonically equivalent JSON keys must not be distinct accounting
        // fields or idempotency inputs (e.g. composed vs decomposed accents).
        // Keep legitimate NFC international labels available.
        throw new TypeError('ERP job payload contains an unsafe Unicode property name');
      }
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable ||
          ['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key)) {
        throw new TypeError('ERP job payload contains an unsafe property');
      }
      // Minor-unit and cent-denominated amounts must be exact integers.
      // JSON.stringify would otherwise preserve a fractional cent in a
      // reservation that downstream accounting may round differently.
      // Other decimal fields (e.g. taxRate) remain permitted.
      // Accept both camelCase and snake_case accounting conventions. Without
      // this, amount_cents: 1.5 bypasses the same exact-minor-unit rule that
      // rejects amountCents: 1.5, creating inconsistent financial receipts.
      if (/(?:MinorUnits?|Minor|Cents?|(?:_|-)(?:minor(?:_|-)?units?|minor|cents?))$/i.test(key) &&
          (typeof descriptor.value !== 'number' ||
           (Number.isFinite(descriptor.value) && !Number.isInteger(descriptor.value)))) {
        // A string, null, boolean, object, or fractional amount can be
        // coerced or rounded downstream. The recursive numeric guard below
        // separately rejects unsafe integers, negative zero and non-finites.
        throw new TypeError('ERP job payload contains an invalid minor-unit amount');
      }
      assertJsonSafe(descriptor.value, seen, depth + 1, budget);
    }
  }
  // Keep completed nodes in the traversal set: repeated references are not
  // independent JSON values and must not be silently duplicated in the digest.
}

// Idempotency must describe the JSON value, not the insertion order of keys
// in a caller's JavaScript object. PostgreSQL jsonb also discards key order;
// canonicalize before both hashing and persistence so equivalent requests
// replay the same reservation rather than reporting a false conflict.
// assertJsonSafe runs first, excluding accessors, Proxies and non-JSON values.
function canonicalJobJson(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJobJson).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .map(key => JSON.stringify(key) + ':' + canonicalJobJson(value[key]))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

// A PostgreSQL timestamp returned as a Date or canonical UTC ISO string is
// acceptable evidence of a persisted job transition. Date.parse alone also
// accepts normalized impossible dates and informal text such as "tomorrow";
// those must never appear as durable accounting acknowledgements.
function persistedUtcTimestamp(value) {
  // Database drivers normally return native Date objects. Never trust an
  // overrideable instance method, subclass, or Proxy to fabricate persisted
  // accounting timestamps: read the built-in Date's internal time slot.
  if (nodeTypes.isProxy(value)) return null;
  if (value instanceof Date) {
    try {
      if (Object.getPrototypeOf(value) !== Date.prototype) return null;
      const epochMs = Date.prototype.getTime.call(value);
      return Number.isFinite(epochMs) ? Date.prototype.toISOString.call(value) : null;
    } catch {
      return null;
    }
  }
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) ||
      new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return value;
}

export async function reserveErpOperationJob({
  db, authenticatedScope, operation, idempotencyKey, payload,
}) {
  if (!db || typeof db.query !== 'function') throw new TypeError('Database connection required');
  const { tenantId, actorId } = authenticatedActorIdentity(authenticatedScope);
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw new TypeError('Invalid idempotency key');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('ERP job payload must be an object');
  }
  assertJsonSafe(payload);
  const json = canonicalJobJson(payload);
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
  // A newly inserted reservation must start queued. Only an idempotent
  // replay may legitimately report a previously claimed, failed, or
  // quarantined job. Never acknowledge a fresh INSERT as already processing
  // or terminal: that would fabricate a job lifecycle without a worker claim.
  if (created && record.status !== 'queued') {
    throw new Error('ERP job storage returned an invalid initial reservation status');
  }
  if (typeof record.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.id) ||
      !['queued', 'processing', 'failed', 'outcome_unknown'].includes(record.status)) {
    throw new Error('ERP job storage returned an invalid job record');
  }
  const createdAt = persistedUtcTimestamp(record.created_at);
  // A reservation timestamp far ahead of the API clock cannot establish that
  // the database has already committed this job. Permit bounded clock skew.
  if (createdAt === null || Date.parse(createdAt) > Date.now() + 5 * 60 * 1000) {
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
  const { tenantId, actorId } = authenticatedActorIdentity(authenticatedScope);
  if (typeof jobId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new TypeError('Invalid ERP job id');
  }
  // PostgreSQL UUID parameters accept uppercase input but returned UUIDs are
  // canonical lowercase. Normalize before SQL and receipt validation so a
  // legitimate status read does not falsely fail after the database responds.
  const canonicalJobId = jobId.toLowerCase();
  const result = await db.query(
    `SELECT id, tenant_id, actor_id, operation, status, created_at, updated_at
     FROM erp_operation_jobs
     WHERE tenant_id = $1 AND actor_id = $2 AND id = $3`,
    [tenantId, actorId, canonicalJobId],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid status result');
  }
  const record = result.rows[0];
  if (!record) return null;
  if (record.id !== canonicalJobId || record.tenant_id !== tenantId ||
      record.actor_id !== actorId || !operations.has(record.operation) ||
      !['queued', 'processing', 'failed', 'outcome_unknown'].includes(record.status)) {
    throw new Error('ERP job storage returned an invalid tenant-bound status');
  }
  const createdAt = persistedUtcTimestamp(record.created_at);
  const updatedAt = persistedUtcTimestamp(record.updated_at);
  if (createdAt === null || updatedAt === null ||
      Date.parse(updatedAt) < Date.parse(createdAt) ||
      Date.parse(createdAt) > Date.now() + 5 * 60 * 1000 ||
      Date.parse(updatedAt) > Date.now() + 5 * 60 * 1000) {
    throw new Error('ERP job storage returned an invalid status timestamp');
  }
  return Object.freeze({
    id: canonicalJobId, tenantId, operation: record.operation,
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
  const { tenantId, workerId } = authenticatedWorkerIdentity(authenticatedWorker);
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 300) {
    throw new TypeError('Invalid ERP worker lease');
  }
  // One SQL statement provides an atomic claim even with concurrent workers.
  // SKIP LOCKED prevents two workers claiming the same queued row. A queued
  // record with an old dispatch fence or terminal failure code must NEVER be
  // reclaimed for external execution, even if schema constraints drift.
  // Likewise, a queued row carrying a stale worker lease is inconsistent;
  // never overwrite that lease and acknowledge another worker's claim.
  const result = await db.query(
    `WITH next_job AS (
       SELECT id FROM erp_operation_jobs
       WHERE tenant_id = $1 AND operation = $2 AND status = 'queued'
         AND dispatch_started_at IS NULL AND failure_code IS NULL
         AND claimed_by IS NULL AND claimed_at IS NULL AND lease_expires_at IS NULL
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
       AND job.dispatch_started_at IS NULL AND job.failure_code IS NULL
       AND job.claimed_by IS NULL AND job.claimed_at IS NULL AND job.lease_expires_at IS NULL
     RETURNING job.id, job.tenant_id, job.actor_id, job.operation,
               job.status, job.claimed_by, job.claimed_at,
               job.lease_expires_at, job.dispatch_started_at, job.failure_code,
               job.created_at, job.updated_at`,
    [tenantId, operation, workerId, leaseSeconds],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid worker claim');
  }
  const record = result.rows[0];
  if (!record) return null;
  // PostgreSQL UUIDs are canonical lowercase, and the persisted actor is
  // part of the worker-claim audit trail. Reject ambiguous receipts before a
  // worker can treat the lease as authorization to begin external dispatch.
  if (typeof record.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.id) ||
      record.tenant_id !== tenantId || record.operation !== operation ||
      record.claimed_by !== workerId || record.status !== 'processing' ||
      record.dispatch_started_at !== null || record.failure_code !== null ||
      !isCanonicalIdentifier(record.actor_id)) {
    throw new Error('ERP job storage returned an invalid tenant-bound worker claim');
  }
  // A claim receipt is evidence of an exclusive database lease. Never accept
  // Date.parse's normalization of impossible dates or informal/local timestamps,
  // and require creation <= claim <= update < lease expiry.
  const claimedAt = persistedUtcTimestamp(record.claimed_at);
  const leaseExpiresAt = persistedUtcTimestamp(record.lease_expires_at);
  const createdAt = persistedUtcTimestamp(record.created_at);
  const updatedAt = persistedUtcTimestamp(record.updated_at);
  if ([claimedAt, leaseExpiresAt, createdAt, updatedAt].some(value => value === null) ||
      Date.parse(createdAt) > Date.parse(claimedAt) ||
      Date.parse(claimedAt) > Date.parse(updatedAt) ||
      Date.parse(updatedAt) >= Date.parse(leaseExpiresAt) ||
      // An initial claim cannot grant an arbitrarily long lease. The SQL
      // statement grants only leaseSeconds; allow bounded clock skew in
      // database receipts, never a multi-hour fabricated worker fence.
      Date.parse(leaseExpiresAt) > Date.parse(claimedAt) + leaseSeconds * 1000 + 5 * 60 * 1000 ||
      Date.parse(createdAt) > Date.now() + 5 * 60 * 1000 ||
      Date.parse(claimedAt) > Date.now() + 5 * 60 * 1000 ||
      Date.parse(updatedAt) > Date.now() + 5 * 60 * 1000) {
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
  const { tenantId, workerId } = authenticatedWorkerIdentity(authenticatedWorker);
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (typeof jobId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new TypeError('Invalid ERP job id');
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 300) {
    throw new TypeError('Invalid ERP worker lease');
  }
  // PostgreSQL returns UUID columns as lowercase text. Canonicalize before
  // the write so a committed lease renewal cannot be reported as a failure
  // solely because a caller supplied an uppercase UUID.
  const canonicalJobId = jobId.toLowerCase();
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
    [tenantId, operation, canonicalJobId, workerId, leaseSeconds],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid lease renewal result');
  }
  const record = result.rows[0];
  if (!record) return null;
  if (record.id !== canonicalJobId || record.tenant_id !== tenantId ||
      record.operation !== operation || record.status !== 'processing' ||
      record.claimed_by !== workerId || typeof record.actor_id !== 'string' ||
      !record.actor_id) {
    throw new Error('ERP job storage returned an invalid tenant-bound lease renewal');
  }
  // Renewal is a persisted worker-lease receipt, not a best-effort clock
  // parse. Require canonical UTC timestamps and the same monotonic chronology
  // as an initial claim: created <= claimed <= updated < lease expiry.
  // Date.parse alone normalizes impossible dates and accepts local strings.
  const claimedAt = persistedUtcTimestamp(record.claimed_at);
  const leaseExpiresAt = persistedUtcTimestamp(record.lease_expires_at);
  const updatedAt = persistedUtcTimestamp(record.updated_at);
  const createdAt = persistedUtcTimestamp(record.created_at);
  if ([claimedAt, leaseExpiresAt, updatedAt, createdAt].some(value => value === null) ||
      Date.parse(createdAt) > Date.parse(claimedAt) ||
      Date.parse(claimedAt) > Date.parse(updatedAt) ||
      Date.parse(updatedAt) >= Date.parse(leaseExpiresAt) ||
      // A future-dated renewal is not reliable proof of a live worker lease.
      // Match the bounded clock-skew policy already enforced on initial claims.
      Date.parse(createdAt) > Date.now() + 5 * 60 * 1000 ||
      Date.parse(claimedAt) > Date.now() + 5 * 60 * 1000 ||
      Date.parse(updatedAt) > Date.now() + 5 * 60 * 1000) {
    throw new Error('ERP job storage returned an invalid lease renewal timestamp');
  }
  return Object.freeze({
    id: canonicalJobId, tenantId, operation, status: 'processing',
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
  const { tenantId, workerId } = authenticatedWorkerIdentity(authenticatedWorker);
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (typeof jobId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new TypeError('Invalid ERP job id');
  }
  // PostgreSQL UUID values are returned in lowercase. Normalize an accepted
  // uppercase UUID before the write so a committed dispatch fence is not
  // falsely rejected after SQL succeeds (which could mislead a retrying worker).
  const canonicalJobId = jobId.toLowerCase();
  // The atomic fence can be recorded only once, by the owning worker while
  // its processing lease is still valid. No fallback when storage fails.
  const result = await db.query(
    `UPDATE erp_operation_jobs
     SET dispatch_started_at = now(), updated_at = now()
     WHERE tenant_id = $1 AND operation = $2 AND id = $3
       AND claimed_by = $4 AND status = 'processing'
       AND lease_expires_at > now() AND dispatch_started_at IS NULL
       AND failure_code IS NULL AND claimed_at IS NOT NULL
     RETURNING id, tenant_id, actor_id, operation, status, claimed_by,
               claimed_at, dispatch_started_at, failure_code, lease_expires_at,
               created_at, updated_at`,
    [tenantId, operation, canonicalJobId, workerId],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid dispatch fence result');
  }
  const row = result.rows[0];
  if (!row) return null;
  if (row.id !== canonicalJobId || row.tenant_id !== tenantId ||
      row.operation !== operation || row.status !== 'processing' ||
      row.claimed_by !== workerId || typeof row.actor_id !== 'string' ||
      !row.actor_id || !Object.hasOwn(row, 'failure_code') ||
      row.failure_code !== null) {
    throw new Error('ERP job storage returned an invalid tenant-bound dispatch fence');
  }
  // A dispatch fence is a durable pre-side-effect boundary. Reject informal
  // dates, normalized impossible dates and chronology that would imply a
  // dispatch after lease expiry or a status update before the dispatch.
  const createdAt = persistedUtcTimestamp(row.created_at);
  const claimedAt = persistedUtcTimestamp(row.claimed_at);
  const dispatchStartedAt = persistedUtcTimestamp(row.dispatch_started_at);
  const leaseExpiresAt = persistedUtcTimestamp(row.lease_expires_at);
  const updatedAt = persistedUtcTimestamp(row.updated_at);
  if ([createdAt, claimedAt, dispatchStartedAt, leaseExpiresAt, updatedAt].some(
    value => value === null
  ) || Date.parse(createdAt) > Date.parse(claimedAt) ||
       Date.parse(claimedAt) > Date.parse(dispatchStartedAt) ||
       Date.parse(dispatchStartedAt) > Date.parse(updatedAt) ||
       Date.parse(updatedAt) >= Date.parse(leaseExpiresAt)) {
    throw new Error('ERP job storage returned an invalid dispatch fence timestamp');
  }
  return Object.freeze({
    id: canonicalJobId, tenantId, operation, status: 'processing',
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
  const { tenantId, workerId } = authenticatedWorkerIdentity(authenticatedWorker);
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (typeof jobId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new TypeError('Invalid ERP job id');
  }
  if (!failureCodes.has(failureCode)) throw new TypeError('Invalid ERP failure code');
  // PostgreSQL returns UUID columns in canonical lowercase form. Normalize
  // before the atomic failure transition so a successful durable write cannot
  // be reported as a failure solely due to uppercase caller input.
  const canonicalJobId = jobId.toLowerCase();

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
               claimed_by, claimed_at, lease_expires_at,
               dispatch_started_at, created_at, updated_at`,
    [tenantId, operation, canonicalJobId, workerId, failureCode],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid failure result');
  }
  const record = result.rows[0];
  if (!record) return null;
  if (record.id !== canonicalJobId || record.tenant_id !== tenantId ||
      record.operation !== operation || record.status !== 'failed' ||
      record.failure_code !== failureCode ||
      record.claimed_by != null || record.claimed_at != null ||
      record.lease_expires_at != null || record.dispatch_started_at !== null ||
      typeof record.actor_id !== 'string' || !record.actor_id) {
    throw new Error('ERP job storage returned an invalid tenant-bound failure');
  }
  // A terminal failure is a persisted state receipt. Reject malformed or
  // normalized dates, non-UTC strings and backwards chronology before
  // acknowledging it to the worker; no provider delivery is implied.
  const createdAt = persistedUtcTimestamp(record.created_at);
  const updatedAt = persistedUtcTimestamp(record.updated_at);
  if (createdAt === null || updatedAt === null ||
      Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new Error('ERP job storage returned an invalid failure timestamp');
  }
  return Object.freeze({
    id: canonicalJobId, tenantId, operation, status: 'failed',
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
  const { tenantId } = authenticatedWorkerIdentity(authenticatedWorker);
  if (!operations.has(operation)) throw new TypeError('Unsupported ERP operation');
  if (typeof jobId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new TypeError('Invalid ERP job id');
  }
  // PostgreSQL UUID columns are returned in canonical lowercase after a write.
  // Normalize before the atomic quarantine so a persisted outcome_unknown
  // transition cannot be misreported as a failed recovery for uppercase input.
  const canonicalJobId = jobId.toLowerCase();
  const result = await db.query(
    `UPDATE erp_operation_jobs
     SET status = 'outcome_unknown',
         claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL,
         updated_at = now()
     WHERE tenant_id = $1 AND operation = $2 AND id = $3
       AND status = 'processing' AND lease_expires_at <= now()
     RETURNING id, tenant_id, actor_id, operation, status, failure_code,
               claimed_by, claimed_at, lease_expires_at,
               dispatch_started_at, created_at, updated_at`,
    [tenantId, operation, canonicalJobId],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > 1) {
    throw new Error('ERP job storage returned an invalid quarantine result');
  }
  const row = result.rows[0];
  if (!row) return null;
  if (row.id !== canonicalJobId || row.tenant_id !== tenantId ||
      row.operation !== operation || row.status !== 'outcome_unknown' ||
      row.failure_code != null || row.claimed_by != null ||
      row.claimed_at != null || row.lease_expires_at != null ||
      !Object.hasOwn(row, 'dispatch_started_at') ||
      typeof row.actor_id !== 'string' || !row.actor_id) {
    throw new Error('ERP job storage returned an invalid tenant-bound quarantine');
  }
  // A recovery receipt is persisted evidence, not an informal Date.parse
  // guess: reject normalized impossible dates and non-UTC strings.
  const createdAt = persistedUtcTimestamp(row.created_at);
  const updatedAt = persistedUtcTimestamp(row.updated_at);
  const dispatchStartedAt = row.dispatch_started_at === null
    ? null : persistedUtcTimestamp(row.dispatch_started_at);
  if (createdAt === null || updatedAt === null ||
      Date.parse(updatedAt) < Date.parse(createdAt) ||
      Date.parse(createdAt) > Date.now() + 300000 ||
      Date.parse(updatedAt) > Date.now() + 300000 ||
      (row.dispatch_started_at !== null && dispatchStartedAt === null) ||
      (dispatchStartedAt !== null &&
       (Date.parse(dispatchStartedAt) < Date.parse(createdAt) ||
        Date.parse(dispatchStartedAt) > Date.parse(updatedAt)))) {
    throw new Error('ERP job storage returned an invalid quarantine timestamp');
  }
  return Object.freeze({
    id: canonicalJobId, tenantId, operation, status: 'outcome_unknown',
    requiresReconciliation: true, dispatchStartedAt, createdAt, updatedAt,
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
  const { tenantId } = authenticatedWorkerIdentity(authenticatedWorker);
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
        // PostgreSQL UUID receipts are lowercase. Reject noncanonical rows
        // so case aliases cannot bypass batch duplicate detection.
        row.id !== row.id.toLowerCase() ||
        seenIds.has(row.id) || row.tenant_id !== tenantId ||
        row.operation !== operation || row.status !== 'outcome_unknown' ||
        !isCanonicalIdentifier(row.actor_id) ||
        row.failure_code != null || row.claimed_by != null ||
        row.claimed_at != null || row.lease_expires_at != null ||
        !Object.hasOwn(row, 'dispatch_started_at')) {
      throw new Error('ERP job storage returned an invalid tenant-bound recovery record');
    }
    seenIds.add(row.id);
    // Fail closed if a recovery/backlog receipt has a noncanonical timestamp.
    // An invalid non-null dispatch time must not become "not dispatched".
    const createdAt = persistedUtcTimestamp(row.created_at);
    const updatedAt = persistedUtcTimestamp(row.updated_at);
    const dispatchStartedAt = row.dispatch_started_at === null
      ? null : persistedUtcTimestamp(row.dispatch_started_at);
    if (createdAt === null || updatedAt === null ||
        Date.parse(updatedAt) < Date.parse(createdAt) ||
        Date.parse(createdAt) > Date.now() + 300000 ||
        Date.parse(updatedAt) > Date.now() + 300000 ||
        (row.dispatch_started_at !== null && dispatchStartedAt === null) ||
        (dispatchStartedAt !== null &&
         (Date.parse(dispatchStartedAt) < Date.parse(createdAt) ||
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
  const { tenantId } = authenticatedWorkerIdentity(authenticatedWorker);
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
            failure_code, claimed_by, claimed_at, lease_expires_at,
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
        !isCanonicalIdentifier(row.actor_id) ||
        // An unknown-outcome job must have no active lease or failure code.
        // Otherwise the reconciliation backlog could falsely present an
        // inconsistent worker state as a safely quarantined job.
        row.failure_code != null || row.claimed_by != null ||
        row.claimed_at != null || row.lease_expires_at != null ||
        !Object.hasOwn(row, 'dispatch_started_at')) {
      throw new Error('ERP job storage returned an invalid tenant-bound reconciliation record');
    }
    previousId = row.id;
    // Fail closed if a recovery/backlog receipt has a noncanonical timestamp.
    // An invalid non-null dispatch time must not become "not dispatched".
    const createdAt = persistedUtcTimestamp(row.created_at);
    const updatedAt = persistedUtcTimestamp(row.updated_at);
    const dispatchStartedAt = row.dispatch_started_at === null
      ? null : persistedUtcTimestamp(row.dispatch_started_at);
    if (createdAt === null || updatedAt === null ||
        Date.parse(updatedAt) < Date.parse(createdAt) ||
        Date.parse(createdAt) > Date.now() + 300000 ||
        Date.parse(updatedAt) > Date.now() + 300000 ||
        (row.dispatch_started_at !== null && dispatchStartedAt === null) ||
        (dispatchStartedAt !== null &&
         (Date.parse(dispatchStartedAt) < Date.parse(createdAt) ||
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
