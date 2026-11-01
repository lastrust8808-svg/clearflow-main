/**
 * PostgreSQL transaction adapter for the non-posting bank-feed commit contract.
 * This is NOT an authentication layer: only a server that has independently
 * authorized the tenant, connection and account IDs may construct the scope.
 * Tables require a separately reviewed migration before this can be wired in.
 * No provider calls or payment operations are performed here.
 */
const CHECKPOINT = 'public.clearflow_bank_feed_checkpoints';
const ENTRIES = 'public.clearflow_bank_feed_entries';

function assertScope(scope) {
  if (!scope || typeof scope !== 'object' ||
      !['plaid', 'mercury'].includes(scope.provider) ||
      !scope.tenantId || !scope.connectionId ||
      !Array.isArray(scope.allowedAccountIds) ||
      scope.allowedAccountIds.length === 0 ||
      scope.allowedAccountIds.length > 1000 ||
      scope.allowedAccountIds.some((id) => typeof id !== 'string' || !id) ||
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

function transactionQueries(client) {
  return {
    async loadCheckpointForUpdate(scope) {
      const result = await client.query(
        `SELECT tenant_id, provider, connection_id, cursor, revision::text AS revision
         FROM ${CHECKPOINT}
         WHERE tenant_id = $1 AND provider = $2 AND connection_id = $3
         FOR UPDATE`,
        params(scope),
      );
      if (result.rows.length !== 1) return null;
      const row = result.rows[0];
      return {
        tenantId: row.tenant_id, provider: row.provider,
        connectionId: row.connection_id, cursor: row.cursor,
        revision: parseRevision(row.revision),
      };
    },
    async loadEntries(scope) {
      const result = await client.query(
        `SELECT payload FROM ${ENTRIES}
         WHERE tenant_id = $1 AND provider = $2 AND connection_id = $3
           AND account_id = ANY($4::text[])
         ORDER BY account_id, transaction_id`,
        [...params(scope), scope.allowedAccountIds],
      );
      return result.rows.map((row) => row.payload);
    },
    async saveEntries(scope, entries) {
      const allowed = new Set(scope.allowedAccountIds);
      params(scope);
      if (!Array.isArray(entries) || entries.some((entry) =>
        !entry || entry.tenantId !== scope.tenantId ||
        entry.provider !== scope.provider ||
        entry.connectionId !== scope.connectionId ||
        !allowed.has(entry.accountId) || !entry.transactionId)) {
        throw new Error('Refusing out-of-scope banking entry write.');
      }
      for (const entry of entries) {
        await client.query(
          `INSERT INTO ${ENTRIES}
             (tenant_id, provider, connection_id, account_id, transaction_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           ON CONFLICT (tenant_id, provider, connection_id, account_id, transaction_id)
           DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
          [...params(scope), entry.accountId, entry.transactionId, JSON.stringify(entry)],
        );
      }
    },
    async compareAndSwapCheckpoint(scope, previous, next) {
      params(scope);
      if (previous.tenantId !== scope.tenantId ||
          previous.provider !== scope.provider ||
          previous.connectionId !== scope.connectionId ||
          next.tenantId !== scope.tenantId ||
          next.provider !== scope.provider ||
          next.connectionId !== scope.connectionId ||
          !Number.isSafeInteger(previous.revision) ||
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
      try {
        await client.query('BEGIN');
        began = true;
        const result = await operation(transactionQueries(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        if (began) {
          try { await client.query('ROLLBACK'); } catch {
            // Preserve the original failure. Connection is released as broken.
          }
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
