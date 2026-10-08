import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import {
  isOwnerDatabaseConfigured,
  ownerAccountIdFromEmail,
  loadOwnerWorkspace,
  saveOwnerWorkspace,
  listOwnerAudit,
  recordOwnerAudit,
} from '../services/ownerDatabase.js';

const router = express.Router();

const CORE_ACCOUNTING_COLLECTIONS = new Set([
  'expenses',
  'receipts',
  'invoices',
  'bills',
  'payments',
  'journalEntries',
  'treasuryAccounts',
  'ledgerAccounts',
  'reconciliations',
  'accountingPeriods',
  'bankFeedRules',
  'bankFeedEntries',
  'customers',
  'vendors',
  'employees',
]);

const LEGACY_ACCOUNTING_FIELDS = new Set([
  'labels',
  'journal',
  'chartOfAccounts',
  'reserves',
  'invoices',
  'bills',
  'loans',
  'payments',
  'plannedAssets',
]);

function getAssistantSecret() {
  return (process.env.CLEARFLOW_ASSISTANT_API_SECRET || '').trim();
}

function getOwnerAccountId() {
  return ownerAccountIdFromEmail(process.env.CLEARFLOW_OWNER_EMAIL);
}

function constantTimeMatch(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));

  if (a.length !== b.length || a.length === 0) {
    return false;
  }

  return timingSafeEqual(a, b);
}

function readPresentedSecret(req) {
  const bearer = req.get('authorization') || '';
  if (bearer.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim();
  }

  return (req.get('x-clearflow-assistant-secret') || '').trim();
}

function requireAssistant(req, res, next) {
  const expected = getAssistantSecret();

  if (!expected) {
    return res.status(503).json({
      success: false,
      error: 'ClearFlow assistant access is not configured.',
    });
  }

  if (!constantTimeMatch(readPresentedSecret(req), expected)) {
    return res.status(401).json({
      success: false,
      error: 'Assistant authentication failed.',
    });
  }

  return next();
}

function redactBankAccount(record) {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const {
    routingNumber,
    accountNumber,
    plaidItemId,
    connectedProfile,
    ...safe
  } = record;

  return {
    ...safe,
    routingNumber: routingNumber ? 'REDACTED' : undefined,
    accountNumber: accountNumber ? 'REDACTED' : undefined,
    plaidItemId: plaidItemId ? 'REDACTED' : undefined,
    connectedProfile: connectedProfile
      ? {
          providerKey: connectedProfile.providerKey,
          providerLabel: connectedProfile.providerLabel,
          connectionRail: connectedProfile.connectionRail,
          sourceInstitutionName: connectedProfile.sourceInstitutionName,
          accountSubtypeLabel: connectedProfile.accountSubtypeLabel,
          supportsLiveSync: connectedProfile.supportsLiveSync,
          supportsTransactionImport: connectedProfile.supportsTransactionImport,
          supportsSettlementInitiation: connectedProfile.supportsSettlementInitiation,
          availabilityStatus: connectedProfile.availabilityStatus,
          connectedAt: connectedProfile.connectedAt,
          lastProviderSyncAt: connectedProfile.lastProviderSyncAt,
        }
      : undefined,
  };
}

function redactLegacyEntity(entity) {
  if (!entity || typeof entity !== 'object') {
    return entity;
  }

  const { accountNumbers, itemId, ...safe } = entity;

  return {
    ...safe,
    accountNumbers: accountNumbers ? { redacted: true } : undefined,
    itemId: itemId ? 'REDACTED' : undefined,
  };
}

function sanitizeWorkspace(appData) {
  if (!appData) {
    return null;
  }

  const core = appData.coreDataSnapshot;

  return {
    ...appData,
    entities: Array.isArray(appData.entities)
      ? appData.entities.map(redactLegacyEntity)
      : [],
    coreDataSnapshot: core
      ? {
          ...core,
          bankAccounts: Array.isArray(core.bankAccounts)
            ? core.bankAccounts.map(redactBankAccount)
            : [],
        }
      : undefined,
  };
}

function requireWorkspaceRow(row, res) {
  if (row) {
    return true;
  }

  res.status(404).json({
    success: false,
    error:
      'Owner workspace has not been seeded into the durable database yet. Sign in to ClearFlow once after owner-pilot configuration is enabled.',
  });
  return false;
}

function upsertById(records, record) {
  const list = Array.isArray(records) ? [...records] : [];
  const id = String(record?.id || '').trim();

  if (!id) {
    throw new Error('Accounting record id is required.');
  }

  const index = list.findIndex((item) => String(item?.id || '') === id);

  if (index >= 0) {
    list[index] = {
      ...list[index],
      ...record,
    };
  } else {
    list.push(record);
  }

  return list;
}

router.use(requireAssistant);

router.get('/status', async (_req, res) => {
  try {
    const accountId = getOwnerAccountId();
    const row = accountId && isOwnerDatabaseConfigured()
      ? await loadOwnerWorkspace(accountId)
      : null;

    return res.status(200).json({
      success: true,
      configured: {
        assistantSecret: Boolean(getAssistantSecret()),
        ownerDatabase: isOwnerDatabaseConfigured(),
        ownerAccount: Boolean(accountId),
      },
      workspaceReady: Boolean(row),
      workspaceVersion: row?.version ?? null,
      updatedAt: row?.updated_at ?? null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Assistant status check failed.',
    });
  }
});

router.get('/workspace', async (_req, res) => {
  try {
    const row = await loadOwnerWorkspace(getOwnerAccountId());

    if (!requireWorkspaceRow(row, res)) {
      return;
    }

    return res.status(200).json({
      success: true,
      version: row.version,
      updatedAt: row.updated_at,
      appData: sanitizeWorkspace(row.app_data),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Owner workspace could not be loaded.',
    });
  }
});

router.get('/entities', async (_req, res) => {
  try {
    const row = await loadOwnerWorkspace(getOwnerAccountId());

    if (!requireWorkspaceRow(row, res)) {
      return;
    }

    const legacy = Array.isArray(row.app_data?.entities)
      ? row.app_data.entities.map((entity) => ({
          id: entity.id,
          name: entity.name,
          type: entity.type,
          ein: entity.ein ? 'REDACTED' : undefined,
          bankConnected: Boolean(entity.bankConnected),
          reserveStatus: entity.reserveStatus,
          labels: entity.labels || {},
          model: 'legacy',
        }))
      : [];

    const core = Array.isArray(row.app_data?.coreDataSnapshot?.entities)
      ? row.app_data.coreDataSnapshot.entities.map((entity) => ({
          id: entity.id,
          name: entity.name,
          displayName: entity.displayName,
          type: entity.type,
          jurisdiction: entity.jurisdiction,
          status: entity.status,
          model: 'core',
        }))
      : [];

    return res.status(200).json({
      success: true,
      version: row.version,
      entities: [...legacy, ...core],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Entities could not be loaded.',
    });
  }
});

router.get('/entities/:entityId/accounting', async (req, res) => {
  try {
    const row = await loadOwnerWorkspace(getOwnerAccountId());

    if (!requireWorkspaceRow(row, res)) {
      return;
    }

    const { entityId } = req.params;
    const appData = row.app_data || {};
    const core = appData.coreDataSnapshot;

    const legacyEntity = Array.isArray(appData.entities)
      ? appData.entities.find((entity) => entity.id === entityId)
      : null;

    const filterEntity = (records) =>
      Array.isArray(records)
        ? records.filter((record) => record?.entityId === entityId)
        : [];

    const accounting = {
      legacy: legacyEntity
        ? {
            entity: redactLegacyEntity(legacyEntity),
          }
        : null,
      core: core
        ? {
            entity:
              Array.isArray(core.entities)
                ? core.entities.find((entity) => entity.id === entityId) || null
                : null,
            customers: filterEntity(core.customers),
            vendors: filterEntity(core.vendors),
            invoices: filterEntity(core.invoices),
            bills: filterEntity(core.bills),
            receipts: filterEntity(core.receipts),
            expenses: filterEntity(core.expenses),
            payments: filterEntity(core.payments),
            employees: filterEntity(core.employees),
            bankAccounts: filterEntity(core.bankAccounts).map(redactBankAccount),
            reconciliations: filterEntity(core.reconciliations),
            accountingPeriods: filterEntity(core.accountingPeriods),
            journalEntries: filterEntity(core.journalEntries),
            treasuryAccounts: filterEntity(core.treasuryAccounts),
            ledgerAccounts: filterEntity(core.ledgerAccounts),
            bankFeedRules: filterEntity(core.bankFeedRules),
            bankFeedEntries: filterEntity(core.bankFeedEntries),
          }
        : null,
    };

    if (!legacyEntity && !accounting.core?.entity) {
      return res.status(404).json({
        success: false,
        error: 'Entity not found in the owner workspace.',
      });
    }

    return res.status(200).json({
      success: true,
      version: row.version,
      entityId,
      accounting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Entity accounting could not be loaded.',
    });
  }
});

router.put('/entities/:entityId/core/:collection/:recordId', async (req, res) => {
  try {
    const { entityId, collection, recordId } = req.params;

    if (!CORE_ACCOUNTING_COLLECTIONS.has(collection)) {
      return res.status(400).json({
        success: false,
        error: 'That accounting collection is not writable through the assistant API.',
      });
    }

    const row = await loadOwnerWorkspace(getOwnerAccountId());

    if (!requireWorkspaceRow(row, res)) {
      return;
    }

    if (!row.app_data?.coreDataSnapshot) {
      return res.status(409).json({
        success: false,
        error: 'Core accounting data has not been initialized in this ClearFlow workspace.',
      });
    }

    const expectedVersion = Number(req.body?.expectedVersion);
    if (!Number.isFinite(expectedVersion)) {
      return res.status(400).json({
        success: false,
        error: 'expectedVersion is required for accounting writes.',
      });
    }

    const record = {
      ...(req.body?.record || {}),
      id: recordId,
      entityId,
    };

    const nextAppData = {
      ...row.app_data,
      coreDataSnapshot: {
        ...row.app_data.coreDataSnapshot,
        [collection]: upsertById(row.app_data.coreDataSnapshot[collection], record),
      },
    };

    const result = await saveOwnerWorkspace({
      accountId: getOwnerAccountId(),
      appData: nextAppData,
      expectedVersion,
      actor: 'chatgpt_assistant',
      action: `core_${collection}_upserted`,
      entityId,
      details: {
        collection,
        recordId,
      },
    });

    return res.status(200).json({
      success: true,
      result,
      record,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Accounting record could not be saved.';
    return res.status(message.includes('version conflict') ? 409 : 500).json({
      success: false,
      error: message,
    });
  }
});

router.patch('/entities/:entityId/legacy-accounting', async (req, res) => {
  try {
    const { entityId } = req.params;
    const row = await loadOwnerWorkspace(getOwnerAccountId());

    if (!requireWorkspaceRow(row, res)) {
      return;
    }

    const expectedVersion = Number(req.body?.expectedVersion);
    if (!Number.isFinite(expectedVersion)) {
      return res.status(400).json({
        success: false,
        error: 'expectedVersion is required for accounting writes.',
      });
    }

    const requestedPatch = req.body?.patch || {};
    const patch = Object.fromEntries(
      Object.entries(requestedPatch).filter(([key]) => LEGACY_ACCOUNTING_FIELDS.has(key))
    );

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No supported legacy accounting fields were supplied.',
      });
    }

    const entities = Array.isArray(row.app_data?.entities)
      ? [...row.app_data.entities]
      : [];
    const index = entities.findIndex((entity) => entity.id === entityId);

    if (index < 0) {
      return res.status(404).json({
        success: false,
        error: 'Legacy entity not found.',
      });
    }

    entities[index] = {
      ...entities[index],
      ...patch,
      id: entities[index].id,
      accountNumbers: entities[index].accountNumbers,
      itemId: entities[index].itemId,
    };

    const nextAppData = {
      ...row.app_data,
      entities,
    };

    const result = await saveOwnerWorkspace({
      accountId: getOwnerAccountId(),
      appData: nextAppData,
      expectedVersion,
      actor: 'chatgpt_assistant',
      action: 'legacy_accounting_updated',
      entityId,
      details: {
        fields: Object.keys(patch),
      },
    });

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Legacy accounting could not be saved.';
    return res.status(message.includes('version conflict') ? 409 : 500).json({
      success: false,
      error: message,
    });
  }
});

router.get('/audit', async (req, res) => {
  try {
    const rows = await listOwnerAudit(
      getOwnerAccountId(),
      req.query?.limit
    );

    return res.status(200).json({
      success: true,
      audit: rows,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Audit log could not be loaded.',
    });
  }
});

router.post('/audit/note', async (req, res) => {
  try {
    const { action, entityId, details } = req.body || {};

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Audit action is required.',
      });
    }

    await recordOwnerAudit({
      accountId: getOwnerAccountId(),
      actor: 'chatgpt_assistant',
      action,
      entityId: entityId || null,
      details: details || {},
    });

    return res.status(201).json({
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Audit note could not be recorded.',
    });
  }
});

export default router;
