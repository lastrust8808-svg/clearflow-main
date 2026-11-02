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

// This adapter can be called without the atomic page planner. Treat even
// server-supplied scopes as untrusted input before issuing scoped SQL; truthy
// numbers, whitespace aliases and invisible control characters are not IDs.
function validScopeId(value) {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= 256 &&
    value === value.trim() && value.isWellFormed() &&
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

function params(scope) {
  assertScope(scope);
  return [scope.tenantId, scope.provider, scope.connectionId];
}

function parseRevision(value) {
  const text = String(value);
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
      value === value.trim() && value.isWellFormed() &&
      !/[\u0000-\u001f\u007f-\u009f\p{Cf}]/u.test(value));
}

// Preserve the exact financial evidence submitted to JSONB. JSON.stringify
// silently converts NaN/Infinity to null, -0 to 0, drops undefined fields,
// invokes getters/toJSON, and accepts already-imprecise integers. Reject
// those shapes before any INSERT, including when called without the planner.
function assertPlainBankingEvidence(value, ancestors = new WeakSet(), depth = 0) {
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
      if (result.rows.length !== 1) return null;
      const row = result.rows[0];
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
      const result = await client.query(
        `SELECT tenant_id, provider, connection_id, account_id, transaction_id, payload
         FROM ${ENTRIES}
         WHERE tenant_id = $1 AND provider = $2 AND connection_id = $3
           AND account_id = ANY($4::text[])
         ORDER BY account_id, transaction_id`,
        [...params(scope), scope.allowedAccountIds],
      );
      // JSONB is not a trusted identity boundary. Verify that each stored
      // payload agrees with its database composite key and the authorized
      // scope before the replay planner can use any historical evidence.
      const allowed = new Set(scope.allowedAccountIds);
      return result.rows.map((row) => {
        const entry = row.payload;
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
            row.tenant_id !== scope.tenantId || row.provider !== scope.provider ||
            row.connection_id !== scope.connectionId ||
            !allowed.has(row.account_id) ||
            entry.tenantId !== row.tenant_id || entry.provider !== row.provider ||
            entry.connectionId !== row.connection_id ||
            entry.accountId !== row.account_id ||
            entry.transactionId !== row.transaction_id) {
          throw new Error('Persisted banking entry identity does not match its scoped database key.');
        }
        // Database JSONB normally enforces valid Unicode, but reject malformed
        // adapter fixtures or corrupted read paths before replay can advance
        // an authenticated connection's synchronization checkpoint.
        assertPlainBankingEvidence(entry);
        return entry;
      });
    },
    async saveEntries(scope, entries) {
      // This adapter is also callable without the page planner. Validate and
      // snapshot the entire batch before the first INSERT: conflicting replay
      // identities must not silently overwrite one another within a page.
      params(scope);
      const allowed = new Set(scope.allowedAccountIds);
      if (!Array.isArray(entries)) {
        throw new Error('Refusing out-of-scope banking entry write.');
      }
      const prepared = [];
      const seen = new Set();
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
            entry.tenantId !== scope.tenantId ||
            entry.provider !== scope.provider ||
            entry.connectionId !== scope.connectionId ||
            !allowed.has(entry.accountId) ||
            !validScopeId(entry.transactionId)) {
          throw new Error('Refusing out-of-scope banking entry write.');
        }
        let serialized;
        let snapshot;
        try {
          assertPlainBankingEvidence(entry);
          serialized = JSON.stringify(entry);
          snapshot = JSON.parse(serialized);
        } catch {
          throw new Error('Refusing non-JSON banking entry write.');
        }
        // A custom serializer or a mutating getter must not change the SQL
        // composite key independently of the JSONB evidence being stored.
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
            snapshot.tenantId !== scope.tenantId ||
            snapshot.provider !== scope.provider ||
            snapshot.connectionId !== scope.connectionId ||
            snapshot.accountId !== entry.accountId ||
            snapshot.transactionId !== entry.transactionId) {
          throw new Error('Refusing banking entry with inconsistent serialized identity.');
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
        await client.query(
          `INSERT INTO ${ENTRIES}
             (tenant_id, provider, connection_id, account_id, transaction_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           ON CONFLICT (tenant_id, provider, connection_id, account_id, transaction_id)
           DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
          [...params(scope), entry.accountId, entry.transactionId, entry.serialized],
        );
      }
    },
    async compareAndSwapCheckpoint(scope, previous, next) {
      params(scope);
      if (!previous || typeof previous !== 'object' ||
          !next || typeof next !== 'object' ||
          previous.tenantId !== scope.tenantId ||
          previous.provider !== scope.provider ||
          previous.connectionId !== scope.connectionId ||
          next.tenantId !== scope.tenantId ||
          next.provider !== scope.provider ||
          next.connectionId !== scope.connectionId ||
          !validCursor(previous.cursor) ||
          !validCursor(next.cursor) || next.cursor === null ||
          !Number.isSafeInteger(previous.revision) || previous.revision < 0 ||
          !Number.isSafeInteger(next.revision) ||
          next.revision !== previous.revision + 1) {
        throw new Error('Refusing out-of-scope banking checkpoint update.');
      }
      const result = await client.query(
        `UPDATE ${CHECKPOINT}
         SET cursor = $4, revision = $5, updated_at = NOW()
         WHERE tenant_id = $1 AND provider = $2 AND connection_id = $3
           AND cursor IS NOT DISTINCT FROM $6
           AND revision = $7
         RETURNING revision`,
        [...params(scope), next.cursor, next.revision, previous.cursor, previous.revision],
      );
      return result.rowCount === 1;
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
