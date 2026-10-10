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

      await db.query(`
        CREATE TABLE IF NOT EXISTS clearflow_owner_provider_events (
          event_id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          resource_type TEXT,
          resource_id TEXT,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          occurred_at TIMESTAMPTZ,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS clearflow_owner_provider_events_lookup_idx
        ON clearflow_owner_provider_events (account_id, provider, resource_id, received_at DESC)
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


function deepMergeEntity(base, patch) {
  const nestedKeys = ['entityAccess', 'branding', 'numbering', 'operationalDefaults'];
  const merged = {
    ...(base || {}),
    ...(patch || {}),
  };

  for (const key of nestedKeys) {
    if (patch?.[key]) {
      merged[key] = {
        ...(base?.[key] || {}),
        ...patch[key],
      };
    }
  }

  return merged;
}

function entityMatches(record, patch) {
  const matchId = String(patch?.matchId || patch?.id || '').trim();
  if (matchId && String(record?.id || '').trim() === matchId) {
    return true;
  }

  const matchName = String(patch?.matchName || patch?.name || '')
    .trim()
    .toLowerCase();

  if (!matchName) {
    return false;
  }

  return [record?.name, record?.displayName]
    .filter(Boolean)
    .some((value) => String(value).trim().toLowerCase() === matchName);
}

function applyEntityPatches(records, patches, { allowCreate = false, deepMerge = false } = {}) {
  let next = Array.isArray(records) ? [...records] : [];
  let changed = false;
  const touched = [];

  for (const patch of Array.isArray(patches) ? patches : []) {
    const index = next.findIndex((record) => entityMatches(record, patch));
    const payload = patch?.value || patch?.patch || patch;

    if (index >= 0) {
      const current = next[index];
      const updated = deepMerge
        ? deepMergeEntity(current, payload)
        : { ...current, ...payload };

      if (JSON.stringify(current) !== JSON.stringify(updated)) {
        next[index] = updated;
        changed = true;
      }

      touched.push(String(updated?.id || current?.id || patch?.matchId || patch?.matchName || 'unknown'));
      continue;
    }

    if (!allowCreate || patch?.createIfMissing !== true) {
      continue;
    }

    const created = deepMerge ? deepMergeEntity({}, payload) : { ...payload };
    if (!created.id || !created.name) {
      throw new Error('Bootstrap entity creation requires id and name.');
    }

    next.unshift(created);
    touched.push(String(created.id));
    changed = true;
  }

  return { records: next, changed, touched };
}

export async function applyOwnerBootstrapPatchFromEnv() {
  const raw = (process.env.CLEARFLOW_OWNER_BOOTSTRAP_PATCH || '').trim();
  if (!raw) {
    return { applied: false, reason: 'not_configured' };
  }

  if (!isOwnerDatabaseConfigured()) {
    return { applied: false, reason: 'owner_database_not_configured' };
  }

  let patch;
  try {
    patch = JSON.parse(raw);
  } catch {
    throw new Error('CLEARFLOW_OWNER_BOOTSTRAP_PATCH must contain valid JSON.');
  }

  const accountId = ownerAccountIdFromEmail(getOwnerEmail());
  const row = await loadOwnerWorkspace(accountId);
  if (!row?.app_data) {
    return { applied: false, reason: 'owner_workspace_missing' };
  }

  const coreResult = applyEntityPatches(
    row.app_data?.coreDataSnapshot?.entities,
    patch.coreEntities,
    { allowCreate: true, deepMerge: true }
  );
  const legacyResult = applyEntityPatches(
    row.app_data?.entities,
    patch.legacyEntities,
    { allowCreate: true, deepMerge: false }
  );

  if (!coreResult.changed && !legacyResult.changed) {
    return {
      applied: false,
      reason: 'no_changes',
      patchId: patch.id || null,
      touchedEntityIds: Array.from(new Set([...coreResult.touched, ...legacyResult.touched])),
    };
  }

  const nextAppData = {
    ...row.app_data,
    entities: legacyResult.records,
    coreDataSnapshot: row.app_data.coreDataSnapshot
      ? {
          ...row.app_data.coreDataSnapshot,
          entities: coreResult.records,
        }
      : row.app_data.coreDataSnapshot,
  };

  const result = await saveOwnerWorkspace({
    accountId,
    appData: nextAppData,
    expectedVersion: row.version,
    actor: 'clearflow_bootstrap',
    action: 'owner_profile_bootstrap_applied',
    details: {
      patchId: patch.id || null,
      coreEntityIds: coreResult.touched,
      legacyEntityIds: legacyResult.touched,
    },
  });

  return {
    applied: true,
    patchId: patch.id || null,
    touchedEntityIds: Array.from(new Set([...coreResult.touched, ...legacyResult.touched])),
    result,
  };
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


export async function recordOwnerProviderEvent({
  accountId,
  provider,
  eventId,
  resourceType = null,
  resourceId = null,
  payload = {},
  occurredAt = null,
}) {
  if (!isConfiguredOwnerAccount(accountId)) {
    throw new Error('This account is not enabled for owner provider event storage.');
  }

  if (!eventId || !provider) {
    throw new Error('Provider event id and provider are required.');
  }

  await ensureOwnerSchema();

  await getPool().query(
    `INSERT INTO clearflow_owner_provider_events
      (event_id, account_id, provider, resource_type, resource_id, payload, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (event_id)
     DO UPDATE SET
       payload = EXCLUDED.payload,
       resource_type = EXCLUDED.resource_type,
       resource_id = EXCLUDED.resource_id,
       occurred_at = EXCLUDED.occurred_at,
       received_at = NOW()`,
    [
      String(eventId),
      accountId,
      String(provider),
      resourceType ? String(resourceType) : null,
      resourceId ? String(resourceId) : null,
      JSON.stringify(payload || {}),
      occurredAt || null,
    ]
  );
}

export async function listOwnerProviderEvents({
  accountId,
  provider,
  resourceId = null,
  limit = 100,
}) {
  if (!isConfiguredOwnerAccount(accountId)) {
    return [];
  }

  await ensureOwnerSchema();
  const cappedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const params = [accountId, provider];
  let resourceClause = '';

  if (resourceId) {
    params.push(resourceId);
    resourceClause = ` AND resource_id = $${params.length}`;
  }

  params.push(cappedLimit);

  const result = await getPool().query(
    `SELECT event_id, account_id, provider, resource_type, resource_id, payload, occurred_at, received_at
     FROM clearflow_owner_provider_events
     WHERE account_id = $1
       AND provider = $2
       ${resourceClause}
     ORDER BY received_at DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows;
}


function mapMercuryProviderState({ approvalRequest, transaction }) {
  const approvalStatus = String(approvalRequest?.status || '');
  const transactionStatus = String(transaction?.status || '');

  if (transactionStatus === 'sent') {
    return {
      paymentStatus: 'settled',
      settlementStatus: 'settled',
      processorStatus: 'settled',
      externalStatus: 'settled',
      verificationStatus: 'verified',
      liveExecution: true,
      executionReason: 'Mercury confirms the payment was sent.',
      settled: true,
    };
  }

  if (transactionStatus === 'reversed') {
    return {
      paymentStatus: 'reversed',
      settlementStatus: 'exception',
      processorStatus: 'requires_review',
      externalStatus: 'returned',
      verificationStatus: 'exception',
      liveExecution: true,
      executionReason: 'Mercury reports that the payment was reversed.',
      settled: false,
    };
  }

  if (['failed', 'cancelled', 'blocked'].includes(transactionStatus)) {
    return {
      paymentStatus: 'failed',
      settlementStatus: 'exception',
      processorStatus: 'blocked',
      externalStatus: 'failed',
      verificationStatus: 'exception',
      liveExecution: Boolean(transaction?.id),
      executionReason: `Mercury reports payment status: ${transactionStatus}.`,
      settled: false,
    };
  }

  if (transactionStatus === 'pending') {
    return {
      paymentStatus: 'initiated',
      settlementStatus: 'clearing',
      processorStatus: 'processing',
      externalStatus: 'processing',
      verificationStatus: 'pending',
      liveExecution: true,
      executionReason: 'Mercury approved the request and the resulting transaction is pending.',
      settled: false,
    };
  }

  if (approvalStatus === 'approved') {
    return {
      paymentStatus: 'initiated',
      settlementStatus: 'clearing',
      processorStatus: 'processing',
      externalStatus: 'processing',
      verificationStatus: 'pending',
      liveExecution: false,
      executionReason: 'Mercury approval is complete; waiting for the resulting bank transaction.',
      settled: false,
    };
  }

  if (approvalStatus === 'rejected' || approvalStatus === 'cancelled') {
    return {
      paymentStatus: 'failed',
      settlementStatus: 'exception',
      processorStatus: 'blocked',
      externalStatus: 'failed',
      verificationStatus: 'exception',
      liveExecution: false,
      executionReason: `Mercury payment request was ${approvalStatus}.`,
      settled: false,
    };
  }

  return {
    paymentStatus: 'initiated',
    settlementStatus: 'verifying',
    processorStatus: 'requires_review',
    externalStatus: 'accepted',
    verificationStatus: 'pending',
    liveExecution: false,
    executionReason: 'Mercury payment request is pending separate approval.',
    settled: false,
  };
}

export async function applyMercuryProviderUpdateToOwnerWorkspace({
  accountId,
  requestId,
  approvalRequest = null,
  transaction = null,
  actor = 'mercury_provider',
}) {
  if (!isConfiguredOwnerAccount(accountId) || !requestId) {
    return { applied: false, reason: 'not_applicable' };
  }

  const row = await loadOwnerWorkspace(accountId);
  const snapshot = row?.app_data?.coreDataSnapshot;
  if (!row?.app_data || !snapshot) {
    return { applied: false, reason: 'workspace_missing' };
  }

  const providerState = mapMercuryProviderState({ approvalRequest, transaction });
  const nowIso = new Date().toISOString();
  const settlementDate =
    transaction?.postedAt ||
    transaction?.estimatedDeliveryDate ||
    transaction?.createdAt ||
    nowIso;

  let changed = false;
  const settlementIds = new Set();
  const paymentIds = new Set();

  const settlements = (snapshot.settlements || []).map((settlement) => {
    if (
      settlement?.executionProvider !== 'mercury' ||
      String(settlement?.executionReference || '') !== String(requestId)
    ) {
      return settlement;
    }

    changed = true;
    settlementIds.add(settlement.id);

    return {
      ...settlement,
      status: providerState.settlementStatus,
      processorStatus: providerState.processorStatus,
      externalStatus: providerState.externalStatus,
      verificationStatus: providerState.verificationStatus,
      liveExecution: providerState.liveExecution,
      executionReason: providerState.executionReason,
      verificationReference: transaction?.id || settlement.verificationReference,
      settledAmount: providerState.settled
        ? Number(settlement.grossAmount || settlement.settledAmount || 0)
        : settlement.settledAmount,
      actualSettlementDate: providerState.settled
        ? String(settlementDate).slice(0, 10)
        : settlement.actualSettlementDate,
      autoReconcileStatus: providerState.settled
        ? 'pending'
        : providerState.verificationStatus === 'exception'
          ? 'exception'
          : settlement.autoReconcileStatus,
      notes: [
        settlement.notes,
        `Mercury status synchronized at ${nowIso}. Request ${requestId}.`,
      ].filter(Boolean).join(' '),
    };
  });

  const payments = (snapshot.payments || []).map((payment) => {
    const executionReference = payment?.settlementExecution?.executionReference;
    if (
      payment?.settlementExecution?.executionProvider !== 'mercury' ||
      String(executionReference || '') !== String(requestId)
    ) {
      return payment;
    }

    changed = true;
    paymentIds.add(payment.id);

    return {
      ...payment,
      status: providerState.paymentStatus,
      releaseStatus: providerState.settled ? 'released' : payment.releaseStatus,
      releasedAt: providerState.settled ? nowIso : payment.releasedAt,
      settlementExecution: {
        ...payment.settlementExecution,
        processorStatus: providerState.processorStatus,
        externalStatus: providerState.externalStatus,
        liveExecution: providerState.liveExecution,
        executionReason: providerState.executionReason,
      },
      notes: [
        payment.notes,
        `Mercury status synchronized at ${nowIso}. Request ${requestId}.`,
      ].filter(Boolean).join(' '),
    };
  });

  if (!changed) {
    return { applied: false, reason: 'execution_not_found' };
  }

  const result = await saveOwnerWorkspace({
    accountId,
    appData: {
      ...row.app_data,
      coreDataSnapshot: {
        ...snapshot,
        settlements,
        payments,
      },
    },
    expectedVersion: row.version,
    actor,
    action: 'mercury_payment_status_synchronized',
    details: {
      requestId: String(requestId),
      approvalStatus: approvalRequest?.status || null,
      transactionId: transaction?.id || null,
      transactionStatus: transaction?.status || null,
      settlementIds: Array.from(settlementIds),
      paymentIds: Array.from(paymentIds),
    },
  });

  return {
    applied: true,
    result,
    settlementIds: Array.from(settlementIds),
    paymentIds: Array.from(paymentIds),
  };
}
