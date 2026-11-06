/**
 * PostgreSQL transaction adapter for the non-posting bank-feed commit contract.
 * This is NOT an authentication layer: only a server that has independently
 * authorized the tenant, connection and account IDs may construct the scope.
 * Tables require a separately reviewed migration before this can be wired in.
 * No provider calls or payment operations are performed here.
 */
import { types as nodeTypes } from 'node:util';

const CHECKPOINT = 'public.clearflow_bank_feed_checkpoints';
const ENTRIES = 'public.clearflow_bank_feed_entries';
// Bound untrusted JSONB evidence independently of provider page event counts.
// This adapter is also callable directly, without the replay planner.
const MAX_ENTRY_JSON_BYTES = 1024 * 1024;
const MAX_BATCH_JSON_BYTES = 16 * 1024 * 1024;

// This adapter can be called without the atomic page planner. Treat even
// server-supplied scopes as untrusted input before issuing scoped SQL; truthy
// numbers, whitespace aliases and invisible control characters are not IDs.
function containsUnicodeNoncharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if ((code >= 0xFDD0 && code <= 0xFDEF) || (code & 0xFFFE) === 0xFFFE) return true;
  }
  return false;
}

function validScopeId(value) {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= 256 &&
    value === value.trim() && value.isWellFormed() && !containsUnicodeNoncharacter(value) &&
    !/[\u0000-\u001f\u007f-\u009f\p{Cf}]/u.test(value);
}

function assertScope(scope) {
  if (!scope || typeof scope !== 'object' ||
      !['plaid', 'mercury'].includes(scope.provider) ||
      !validScopeId(scope.tenantId) ||
      !validScopeId(scope.connectionId) ||
      !Array.isArray(scope.allowedAccountIds) ||
      scope.allowedAccountIds.length === 0 ||
      scope.allowedAccountIds.length > 1000 ||
      scope.allowedAccountIds.some((id) => !validScopeId(id)) ||
      new Set(scope.allowedAccountIds).size !== scope.allowedAccountIds.length) {
    throw new Error('Invalid authenticated banking scope.');
  }
}

// Snapshot the authorization scope before the first asynchronous database
// operation. A caller must not be able to retarget later INSERTs or expand
// read permissions by mutating the original scope while a query is pending.
// Read own data descriptors so getters/Proxies cannot supply shifting IDs.
function snapshotScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || nodeTypes.isProxy(scope)) {
    throw new Error('Invalid authenticated banking scope.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(scope);
  const ownValue = (key) => {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new Error('Invalid authenticated banking scope.');
    }
    return descriptor.value;
  };
  const originalIds = ownValue('allowedAccountIds');
  if (!Array.isArray(originalIds) || nodeTypes.isProxy(originalIds)) {
    throw new Error('Invalid authenticated banking scope.');
  }
  const idDescriptors = Object.getOwnPropertyDescriptors(originalIds);
  if (Reflect.ownKeys(idDescriptors).length !== originalIds.length + 1) {
    throw new Error('Invalid authenticated banking scope.');
  }
  const allowedAccountIds = [];
  for (let i = 0; i < originalIds.length; i++) {
    const descriptor = idDescriptors[String(i)];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new Error('Invalid authenticated banking scope.');
    }
    allowedAccountIds.push(descriptor.value);
  }
  const stable = {
    tenantId: ownValue('tenantId'),
    provider: ownValue('provider'),
    connectionId: ownValue('connectionId'),
    allowedAccountIds,
  };
  assertScope(stable);
  return stable;
}

function params(scope) {
  const stable = snapshotScope(scope);
  return [stable.tenantId, stable.provider, stable.connectionId];
}

// The SQL projection explicitly requests revision::text. Never coerce an
// unexpected adapter value: String(object) can invoke attacker-controlled
// toString/Symbol.toPrimitive and turn a malformed checkpoint into revision 0.
function parseRevision(value) {
  if (typeof value !== 'string') {
    throw new Error('Invalid persisted banking checkpoint revision.');
  }
  const text = value;
  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error('Invalid persisted banking checkpoint revision.');
  }
  const number = Number(text);
  if (!Number.isSafeInteger(number)) {
    throw new Error('Unsafe persisted banking checkpoint revision.');
  }
  return number;
}

// Checkpoint cursors are opaque provider tokens, never SQL-coercible values.
// Validate even when this adapter is invoked without the page planner.
function validCursor(value) {
  return value === null ||
    (typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
      value === value.trim() && value.isWellFormed() && !containsUnicodeNoncharacter(value) &&
      !/[\u0000-\u001f\u007f-\u009f\p{Cf}]/u.test(value));
}

// Preserve the exact financial evidence submitted to JSONB. JSON.stringify
// silently converts NaN/Infinity to null, -0 to 0, drops undefined fields,
// invokes getters/toJSON, and accepts already-imprecise integers. Reject
// those shapes before any INSERT, including when called without the planner.
// JSON.stringify invokes inherited toJSON on otherwise plain objects and
// arrays before any replacer can inspect the evidence. A polluted runtime
// prototype must never rewrite financial entries or historical JSONB records.
function assertNativeBankingJsonPrototypesSafe() {
  if (Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON') ||
      Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON')) {
    throw new TypeError('Inherited banking JSON serializer would alter evidence.');
  }
}

function assertPlainBankingEvidence(value, ancestors = new WeakSet(), depth = 0) {
  if (depth === 0) assertNativeBankingJsonPrototypesSafe();
  if (typeof value === 'string') {
    if (!value.isWellFormed()) throw new TypeError('Malformed Unicode banking evidence.');
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || Object.is(value, -0)) {
      throw new TypeError('Unsafe banking evidence numeric value.');
    }
    return;
  }
  if (typeof value !== 'object' || depth > 128 || nodeTypes.isProxy(value)) {
    throw new TypeError('Banking evidence must contain bounded plain JSON values.');
  }
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Banking evidence must contain plain objects and arrays.');
  }
  if (ancestors.has(value)) throw new TypeError('Cyclic banking evidence.');
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (isArray && Object.keys(value).length !== value.length) {
      throw new TypeError('Sparse banking evidence array.');
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      if (isArray && key === 'length') continue;
      const descriptor = descriptors[key];
      if (typeof key === 'string' && !key.isWellFormed()) {
        throw new TypeError('Malformed Unicode banking evidence property.');
      }
      if (typeof key !== 'string' || !descriptor.enumerable ||
          !Object.hasOwn(descriptor, 'value') ||
          ['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key) ||
          (isArray && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
        throw new TypeError('Unsafe banking evidence property.');
      }
      assertPlainBankingEvidence(descriptor.value, ancestors, depth + 1);
    }
  } finally {
    ancestors.delete(value);
  }
}

// Direct adapter callers can bypass the atomic page planner. Never iterate
// a caller-owned array: a Proxy, accessor-backed index, sparse batch, or
// custom iterator could execute code or change the rows selected for INSERT.
// Snapshot indexed data descriptors before inspecting any financial record.
function snapshotBankingEntryBatch(entries, label = 'banking entry batch') {
  if (!Array.isArray(entries) || nodeTypes.isProxy(entries) ||
      Object.getPrototypeOf(entries) !== Array.prototype) {
    throw new Error(`Refusing malformed ${label}.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(entries);
  if (Reflect.ownKeys(descriptors).length !== entries.length + 1) {
    throw new Error(`Refusing malformed ${label}.`);
  }
  const snapshot = [];
  for (let index = 0; index < entries.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new Error(`Refusing malformed ${label}.`);
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

// pg QueryResult normally exposes an own data-valued rows array. Do not
// access a getter-backed or Proxy result envelope, then iterate a caller-
// controlled rows array: either could execute code before row validation.
// Detach canonical indexed row references before reading any SQL identity.
function snapshotBankingQueryRows(result) {
  if (!result || typeof result !== 'object' || nodeTypes.isProxy(result)) {
    throw new Error('Refusing malformed banking SQL result envelope.');
  }
  const rowsDescriptor = Object.getOwnPropertyDescriptor(result, 'rows');
  if (!rowsDescriptor || !rowsDescriptor.enumerable ||
      !Object.hasOwn(rowsDescriptor, 'value')) {
    throw new Error('Refusing malformed banking SQL result envelope.');
  }
  return snapshotBankingEntryBatch(rowsDescriptor.value, 'banking SQL result rows');
}

// PostgreSQL returns plain row objects, but a broken adapter or injected
// fixture can supply executable getters or a Proxy. Never access persisted
// checkpoint identities or revision until all selected fields are inert.
function snapshotPersistedCheckpointRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) ||
      nodeTypes.isProxy(row)) {
    throw new Error('Invalid persisted banking checkpoint row.');
  }
  const prototype = Object.getPrototypeOf(row);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Invalid persisted banking checkpoint row.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(row);
  const keys = ['tenant_id', 'provider', 'connection_id', 'cursor', 'revision'];
  if (Reflect.ownKeys(descriptors).length !== keys.length) {
    throw new Error('Invalid persisted banking checkpoint row.');
  }
  const snapshot = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable ||
        !Object.hasOwn(descriptor, 'value')) {
      throw new Error('Invalid persisted banking checkpoint row.');
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

// Treat PostgreSQL row envelopes as untrusted at the adapter boundary.
// Validate their own data descriptors before reading payload or SQL keys;
// accessors, Proxies and inherited fields must never affect reconciliation.
function snapshotPersistedEntryRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) ||
      nodeTypes.isProxy(row)) {
    throw new Error('Invalid persisted banking entry row.');
  }
  const prototype = Object.getPrototypeOf(row);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Invalid persisted banking entry row.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(row);
  const keys = ['tenant_id', 'provider', 'connection_id', 'account_id', 'transaction_id', 'payload'];
  if (Reflect.ownKeys(descriptors).length !== keys.length) {
    throw new Error('Invalid persisted banking entry row.');
  }
  const snapshot = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable ||
        !Object.hasOwn(descriptor, 'value')) {
      throw new Error('Invalid persisted banking entry row.');
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function transactionQueries(client) {
  return {
    async loadCheckpointForUpdate(scope) {
      const requestedScope = params(scope);
      const result = await client.query(
        `SELECT tenant_id, provider, connection_id, cursor, revision::text AS revision
         FROM ${CHECKPOINT}
         WHERE tenant_id = $1 AND provider = $2 AND connection_id = $3
         FOR UPDATE`,
        requestedScope,
      );
      const rows = snapshotBankingQueryRows(result);
      if (rows.length === 0) return null;
      // A scoped checkpoint is unique. Multiple rows indicate corrupted SQL
      // evidence, never an absent checkpoint eligible for replay.
      if (rows.length !== 1) {
        throw new Error('Multiple persisted banking checkpoints for authorized scope.');
      }
      const row = snapshotPersistedCheckpointRow(rows[0]);
      // Verify database-returned identity independently of the WHERE clause.
      // A faulty adapter, corrupted fixture or unexpected row must never be
      // treated as an authorized checkpoint by direct store callers.
      if (row.tenant_id !== requestedScope[0] ||
          row.provider !== requestedScope[1] ||
          row.connection_id !== requestedScope[2]) {
        throw new Error('Persisted banking checkpoint identity does not match authorized scope.');
      }
      if (!validCursor(row.cursor)) {
        throw new Error('Invalid persisted banking checkpoint cursor.');
      }
      return {
        tenantId: row.tenant_id, provider: row.provider,
        connectionId: row.connection_id, cursor: row.cursor,
        revision: parseRevision(row.revision),
      };
    },
    async loadEntries(scope) {
      const authorized = snapshotScope(scope);
      const requestedScope = [authorized.tenantId, authorized.provider, authorized.connectionId];
      const result = await client.query(
        `SELECT tenant_id, provider, connection_id, account_id, transaction_id, payload
         FROM ${ENTRIES}
         WHERE tenant_id = $1 AND provider = $2 AND connection_id = $3
           AND account_id = ANY($4::text[])
         ORDER BY account_id, transaction_id`,
        [...requestedScope, authorized.allowedAccountIds],
      );
      // JSONB is not a trusted identity boundary. Verify that each stored
      // payload agrees with its database composite key and the authorized
      // scope before the replay planner can use any historical evidence.
      const allowed = new Set(authorized.allowedAccountIds);
      const seenPersistedKeys = new Set();
      let totalPersistedJsonBytes = 0;
      return snapshotBankingQueryRows(result).map((untrustedRow) => {
        const row = snapshotPersistedEntryRow(untrustedRow);
        const entry = row.payload;
        // Validate the complete JSONB object *before* reading identity fields.
        // A faulty adapter or in-memory fixture may return getters/Proxies;
        // accessing entry.tenantId first could execute untrusted code.
        assertPlainBankingEvidence(entry);
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
            row.tenant_id !== requestedScope[0] || row.provider !== requestedScope[1] ||
            row.connection_id !== requestedScope[2] ||
            !allowed.has(row.account_id) ||
            // Corrupt legacy JSONB must not introduce ambiguous transaction IDs
            // into replay planning, even when its payload matches the SQL key.
            !validScopeId(row.transaction_id) ||
            entry.tenantId !== row.tenant_id || entry.provider !== row.provider ||
            entry.connectionId !== row.connection_id ||
            entry.accountId !== row.account_id ||
            entry.transactionId !== row.transaction_id) {
          throw new Error('Persisted banking entry identity does not match its scoped database key.');
        }
        // SQL composite keys are unique. Duplicate rows from a faulty adapter
        // or corrupted read must never be accepted as independent evidence.
        const persistedKey = JSON.stringify([row.account_id, row.transaction_id]);
        if (seenPersistedKeys.has(persistedKey)) {
          throw new Error('Duplicate persisted banking entry identity in authorized scope.');
        }
        seenPersistedKeys.add(persistedKey);
        // Database JSONB normally enforces valid Unicode, but the guard above
        // also rejects malformed adapter fixtures before replay or checkpoint updates.
        const entryBytes = Buffer.byteLength(JSON.stringify(entry), 'utf8');
        if (entryBytes > MAX_ENTRY_JSON_BYTES) {
          throw new Error('Oversized persisted banking entry evidence.');
        }
        totalPersistedJsonBytes += entryBytes;
        if (totalPersistedJsonBytes > MAX_BATCH_JSON_BYTES) {
          throw new Error('Oversized persisted banking entry batch evidence.');
        }
        return entry;
      });
    },
    async saveEntries(scope, entries) {
      // This adapter is also callable without the page planner. Validate and
      // snapshot the entire batch before the first INSERT: conflicting replay
      // identities must not silently overwrite one another within a page.
      const authorized = snapshotScope(scope);
      const requestedScope = [authorized.tenantId, authorized.provider, authorized.connectionId];
      const allowed = new Set(authorized.allowedAccountIds);
      const detachedEntries = snapshotBankingEntryBatch(entries);
      const prepared = [];
      const seen = new Set();
      let totalJsonBytes = 0;
      for (const entry of detachedEntries) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new Error('Refusing out-of-scope banking entry write.');
        }
        // Never read an untrusted entry's identity before checking its own
        // property descriptors. Accessors and Proxy traps could otherwise run
        // during the scope check, before the JSON evidence guard executes.
        let serialized;
        let snapshot;
        try {
          assertPlainBankingEvidence(entry);
          serialized = JSON.stringify(entry);
          snapshot = JSON.parse(serialized);
        } catch {
          throw new Error('Refusing non-JSON banking entry write.');
        }
        // Construct SQL identity exclusively from the inert serialized
        // snapshot; no unvalidated entry property may influence a query.
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
            snapshot.tenantId !== requestedScope[0] ||
            snapshot.provider !== requestedScope[1] ||
            snapshot.connectionId !== requestedScope[2] ||
            !allowed.has(snapshot.accountId) ||
            !validScopeId(snapshot.transactionId)) {
          throw new Error('Refusing out-of-scope banking entry write.');
        }
        const jsonBytes = Buffer.byteLength(serialized, 'utf8');
        if (jsonBytes > MAX_ENTRY_JSON_BYTES) {
          throw new Error('Refusing oversized banking entry write.');
        }
        totalJsonBytes += jsonBytes;
        if (totalJsonBytes > MAX_BATCH_JSON_BYTES) {
          throw new Error('Refusing oversized banking batch write.');
        }
        const key = JSON.stringify([snapshot.accountId, snapshot.transactionId]);
        if (seen.has(key)) {
          throw new Error('Duplicate banking entry identity in write batch.');
        }
        seen.add(key);
        prepared.push({
          accountId: snapshot.accountId,
          transactionId: snapshot.transactionId,
          serialized,
        });
      }
      for (const entry of prepared) {
        const insertResult = await client.query(
          `INSERT INTO ${ENTRIES}
             (tenant_id, provider, connection_id, account_id, transaction_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           ON CONFLICT (tenant_id, provider, connection_id, account_id, transaction_id)
           DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
          [...requestedScope, entry.accountId, entry.transactionId, entry.serialized],
        );
        // Every upsert must affect exactly one row. A zero-row or malformed
        // adapter response must never allow a checkpoint to acknowledge
        // financial evidence that was not actually persisted.
        if (!insertResult || typeof insertResult !== 'object' ||
            nodeTypes.isProxy(insertResult)) {
          throw new Error('Invalid banking entry upsert result.');
        }
        const affected = Object.getOwnPropertyDescriptor(insertResult, 'rowCount');
        if (!affected || !Object.hasOwn(affected, 'value') ||
            affected.value !== 1) {
          throw new Error('Invalid banking entry upsert result.');
        }
      }
    },
    async compareAndSwapCheckpoint(scope, previous, next) {
      // A direct caller must not retarget the checkpoint between validation
      // and SQL parameter construction. Snapshot authorization exactly once.
      const authorized = snapshotScope(scope);
      const requestedScope = [authorized.tenantId, authorized.provider, authorized.connectionId];
      // Never invoke getters or Proxy traps on supplied checkpoint evidence.
      // Snapshot all fields before constructing the UPDATE parameters.
      const snapshotCheckpoint = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            nodeTypes.isProxy(value)) {
          throw new Error('Refusing out-of-scope banking checkpoint update.');
        }
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const read = (key) => {
          const descriptor = descriptors[key];
          if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
            throw new Error('Refusing out-of-scope banking checkpoint update.');
          }
          return descriptor.value;
        };
        return {
          tenantId: read('tenantId'),
          provider: read('provider'),
          connectionId: read('connectionId'),
          cursor: read('cursor'),
          revision: read('revision'),
        };
      };
      const prior = snapshotCheckpoint(previous);
      const following = snapshotCheckpoint(next);
      if (prior.tenantId !== requestedScope[0] ||
          prior.provider !== requestedScope[1] ||
          prior.connectionId !== requestedScope[2] ||
          following.tenantId !== requestedScope[0] ||
          following.provider !== requestedScope[1] ||
          following.connectionId !== requestedScope[2] ||
          !validCursor(prior.cursor) ||
          !validCursor(following.cursor) || following.cursor === null ||
          // An unchanged provider cursor is a terminal no-op, not a new page.
          // Reject revision-only advances even for direct adapter callers.
          following.cursor === prior.cursor ||
          !Number.isSafeInteger(prior.revision) || prior.revision < 0 ||
          !Number.isSafeInteger(following.revision) ||
          following.revision !== prior.revision + 1) {
        throw new Error('Refusing out-of-scope banking checkpoint update.');
      }
      const result = await client.query(
        `UPDATE ${CHECKPOINT}
         SET cursor = $4, revision = $5, updated_at = NOW()
         WHERE tenant_id = $1 AND provider = $2 AND connection_id = $3
           AND cursor IS NOT DISTINCT FROM $6
           AND revision = $7
         RETURNING revision`,
        [...requestedScope, following.cursor, following.revision, prior.cursor, prior.revision],
      );
      // Never treat a malformed SQL result as successful checkpoint CAS.
      if (!result || typeof result !== 'object' || nodeTypes.isProxy(result)) {
        throw new Error('Invalid banking checkpoint update result.');
      }
      const count = Object.getOwnPropertyDescriptor(result, 'rowCount');
      if (!count || !Object.hasOwn(count, 'value') ||
          !Number.isSafeInteger(count.value) || count.value < 0 || count.value > 1) {
        throw new Error('Invalid banking checkpoint update result.');
      }
      return count.value === 1;
    },
  };
}

/** Resolve only after PostgreSQL COMMIT succeeds; always release the client. */
export function createBankFeedPostgresStore(pool) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new Error('A PostgreSQL pool with connect() is required.');
  }
  return {
    async withTransaction(operation) {
      const client = await pool.connect();
      let began = false;
      let commitAttempted = false;
      let discardConnection = false;
      try {
        await client.query('BEGIN');
        began = true;
        const result = await operation(transactionQueries(client));
        commitAttempted = true;
        await client.query('COMMIT');
        return result;
      } catch (error) {
        // A failed BEGIN or COMMIT leaves connection state uncertain. Never
        // return that client to the pool, even if a subsequent ROLLBACK works.
        discardConnection = !began || commitAttempted;
        if (began) {
          try { await client.query('ROLLBACK'); } catch {
            // A failed rollback also makes the client unsafe to reuse.
            discardConnection = true;
          }
        }
        throw error;
      } finally {
        client.release(discardConnection
          ? new Error('Discard banking PostgreSQL client after uncertain transaction state.')
          : undefined);
      }
    },
  };
}
