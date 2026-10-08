import pg from 'pg';

const { Pool } = pg;

let pool;
let schemaReady;

function getConnectionString() {
  return (process.env.CLEARFLOW_OWNER_DATABASE_URL || '').trim();
}

function getOwnerEmail() {
  return (process.env.CLEARFLOW_OWNER_EMAIL || '').trim().toLowerCase();
}

export function isOwnerDatabaseConfigured() {
  return Boolean(getConnectionString() && getOwnerEmail());
}

export function ownerAccountIdFromEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized ? `google:${normalized}` : '';
}

export function isConfiguredOwnerAccount(accountId) {
  if (!isOwnerDatabaseConfigured()) {
    return false;
  }

  return String(accountId || '').trim().toLowerCase() === ownerAccountIdFromEmail(getOwnerEmail());
}

function getPool() {
  if (!getConnectionString()) {
    throw new Error('CLEARFLOW_OWNER_DATABASE_URL is not configured.');
  }

  if (!pool) {
    const connectionString = getConnectionString();
    const usesPublicRenderHost =
      connectionString.includes('.render.com') && !connectionString.includes('.internal');

    pool = new Pool({
      connectionString,
      ssl: usesPublicRenderHost ? { rejectUnauthorized: false } : false,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return pool;
}

export async function ensureOwnerSchema() {
  if (!isOwnerDatabaseConfigured()) {
    return false;
  }

  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getPool();

      await db.query(`
        CREATE TABLE IF NOT EXISTS clearflow_owner_workspaces (
          account_id TEXT PRIMARY KEY,
          owner_email TEXT NOT NULL,
          app_data JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS clearflow_owner_workspaces_owner_email_idx
        ON clearflow_owner_workspaces (LOWER(owner_email))
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS clearflow_owner_audit_log (
          id BIGSERIAL PRIMARY KEY,
          account_id TEXT NOT NULL,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          entity_id TEXT,
          details JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS clearflow_owner_audit_log_account_idx
        ON clearflow_owner_audit_log (account_id, created_at DESC)
      `);

      return true;
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }

  return schemaReady;
}

export async function loadOwnerWorkspace(accountId) {
  if (!isConfiguredOwnerAccount(accountId)) {
    return null;
  }

  await ensureOwnerSchema();
  const result = await getPool().query(
    `SELECT account_id, owner_email, app_data, version, created_at, updated_at
     FROM clearflow_owner_workspaces
     WHERE account_id = $1`,
    [accountId]
  );

  return result.rows[0] || null;
}

export async function saveOwnerWorkspace({
  accountId,
  appData,
  actor = 'clearflow_app',
  action = 'workspace_saved',
  entityId = null,
  details = {},
  expectedVersion,
}) {
  if (!isConfiguredOwnerAccount(accountId)) {
    throw new Error('This account is not enabled for owner database storage.');
  }

  const normalizedOwnerEmail = getOwnerEmail();
  const payloadEmail = String(appData?.user?.email || '').trim().toLowerCase();

  if (!payloadEmail || payloadEmail !== normalizedOwnerEmail) {
    throw new Error('Owner workspace identity does not match the configured owner account.');
  }

  await ensureOwnerSchema();
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const current = await client.query(
      `SELECT version
       FROM clearflow_owner_workspaces
       WHERE account_id = $1
       FOR UPDATE`,
      [accountId]
    );

    let nextVersion;

    if (current.rows.length === 0) {
      if (expectedVersion !== undefined && expectedVersion !== null && Number(expectedVersion) !== 0) {
        throw new Error('Owner workspace version conflict.');
      }

      nextVersion = 1;
      await client.query(
        `INSERT INTO clearflow_owner_workspaces
          (account_id, owner_email, app_data, version)
         VALUES ($1, $2, $3::jsonb, $4)`,
        [accountId, normalizedOwnerEmail, JSON.stringify(appData), nextVersion]
      );
    } else {
      const currentVersion = Number(current.rows[0].version || 0);

      if (
        expectedVersion !== undefined &&
        expectedVersion !== null &&
        Number(expectedVersion) !== currentVersion
      ) {
        throw new Error('Owner workspace version conflict.');
      }

      nextVersion = currentVersion + 1;

      await client.query(
        `UPDATE clearflow_owner_workspaces
         SET app_data = $2::jsonb,
             owner_email = $3,
             version = $4,
             updated_at = NOW()
         WHERE account_id = $1`,
        [accountId, JSON.stringify(appData), normalizedOwnerEmail, nextVersion]
      );
    }

    await client.query(
      `INSERT INTO clearflow_owner_audit_log
        (account_id, actor, action, entity_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        accountId,
        actor,
        action,
        entityId,
        JSON.stringify({
          ...details,
          version: nextVersion,
        }),
      ]
    );

    await client.query('COMMIT');

    return {
      accountId,
      version: nextVersion,
      savedAt: new Date().toISOString(),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordOwnerAudit({
  accountId,
  actor,
  action,
  entityId = null,
  details = {},
}) {
  if (!isConfiguredOwnerAccount(accountId)) {
    throw new Error('This account is not enabled for owner database storage.');
  }

  await ensureOwnerSchema();

  await getPool().query(
    `INSERT INTO clearflow_owner_audit_log
      (account_id, actor, action, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [accountId, actor, action, entityId, JSON.stringify(details)]
  );
}

export async function listOwnerAudit(accountId, limit = 100) {
  if (!isConfiguredOwnerAccount(accountId)) {
    return [];
  }

  await ensureOwnerSchema();

  const cappedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = await getPool().query(
    `SELECT id, account_id, actor, action, entity_id, details, created_at
     FROM clearflow_owner_audit_log
     WHERE account_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [accountId, cappedLimit]
  );

  return result.rows;
}
