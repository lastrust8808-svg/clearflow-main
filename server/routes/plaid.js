import { stagePlaidDelivery, acknowledgePlaidDelivery } from '../services/plaidDelivery.js';
import { isConfiguredOwnerAccount, loadOwnerWorkspace } from '../services/ownerDatabase.js';
import { plaidItemStorageConfigured, readPlaidItem, writePlaidItem } from '../services/plaidItemStorage.js';
import { requireAccountAccess } from '../middleware/accountAuthorization.js';
import express from 'express';
import { createHash, createPublicKey, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from 'plaid';
import { loadAccountAppData, loadAccountPlaidVault, saveAccountPlaidVault } from '../services/accountStorage.js';
import { decryptJson, encryptJson } from '../utils/secureVault.js';

const router = express.Router();
// Fail closed for banking operations; provider webhooks use their own signature verification.
router.use((req, res, next) => {
  if (req.path === '/webhook') return next();
  const accountId = req.get('x-clearflow-account-id');
  if (!accountId) return res.status(401).json({ error: 'Account authentication required.' });
  req.params.accountId = accountId;
  return requireAccountAccess(req, res, () => {
    req.verifiedAccountId = accountId;
    next();
  });
});


const itemStore = new Map();
const accountIndex = new Map();
const transactionCursorStore = new Map();
const SUPPORTED_PLAID_ENVIRONMENTS = new Set(['sandbox', 'development', 'production']);

async function loadPersistedConnections(userId) {
  if (!userId) {
    return [];
  }

  try {
    const record = await loadAccountPlaidVault(userId);
    if (!record?.encryptedPayload) {
      return [];
    }
    const connections = decryptJson(record.encryptedPayload);
    return Array.isArray(connections) ? connections : [];
  } catch (error) {
    console.warn(`Unable to load persisted Plaid connections for ${userId}.`, error);
    return [];
  }
}

async function savePersistedConnections(userId, item) {
  if (plaidItemStorageConfigured()) return writePlaidItem(item);
  if (!userId) {
    return;
  }

  const connections = Array.from(itemStore.values()).filter((item) => item.userId === userId);
  const encryptedPayload = encryptJson(
    connections.map((item) => ({
      userId: item.userId,
      accessToken: item.accessToken,
      itemId: item.itemId,
      authResponse: item.authResponse,
      identityData: item.identityData,
      accounts: item.accounts,
      cursor: transactionCursorStore.get(item.itemId) || null,
      pendingAddedTransactions: item.pendingAddedTransactions || [],
      pendingModifiedTransactions: item.pendingModifiedTransactions || [],
      removedTransactionIds: item.removedTransactionIds || [],
      delivery: item.delivery || null,
      lastAcknowledgedDeliveryId: item.lastAcknowledgedDeliveryId || null,
    }))
  );

  await saveAccountPlaidVault(userId, { encryptedPayload });
}

async function hydrateStoredItemByItemId(itemId) {
  if (!itemId) {
    return null;
  }

  if (plaidItemStorageConfigured()) return readPlaidItem(itemId);
  if (process.env.NODE_ENV === 'production') throw new Error('Durable Plaid storage required.');
  if (itemStore.has(itemId)) {
    return itemStore.get(itemId);
  }

  try {
    const { readdir } = await import('node:fs/promises');
    const path = await import('node:path');
    const accountsRoot = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
    // A fresh stateless deployment may have no legacy account directory.
    // Treat that as an empty legacy index, not a provider failure.
    let accountDirectories;
    try {
      accountDirectories = await readdir(accountsRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }

    for (const entry of accountDirectories) {
      if (!entry.isDirectory()) {
        continue;
      }

      const userId = decodeURIComponent(entry.name);
      const connections = await loadPersistedConnections(userId);
      const matched = connections.find((connection) => connection.itemId === itemId);
      if (!matched) {
        continue;
      }

      itemStore.set(itemId, matched);
      (matched.accounts || []).forEach((account) => {
        accountIndex.set(account.account_id, itemId);
      });
      if (matched.cursor) {
        transactionCursorStore.set(itemId, matched.cursor);
      }
      return matched;
    }
  } catch (error) {
    console.warn(`Unable to hydrate Plaid item ${itemId} from persisted storage.`, error);
  }

  return null;
}

function isPlaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

function getPlaidEnvironment() {
  const normalized = String(process.env.PLAID_ENV || 'sandbox')
    .trim()
    .toLowerCase();
  return SUPPORTED_PLAID_ENVIRONMENTS.has(normalized) ? normalized : 'sandbox';
}

function getPlaidWebhookUrl() {
  const raw = String(process.env.PLAID_WEBHOOK_URL || '').trim();
  if (!raw || raw.toLowerCase() === 'value') {
    return undefined;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function buildPlaidClientUserId(userId) {
  const normalized = String(userId || '').trim().toLowerCase();
  const digest = createHash('sha256')
    .update(`clearflow:${normalized}`)
    .digest('hex')
    .slice(0, 40);
  return `cf-${digest}`;
}

function getPlaidClient() {
  if (!isPlaidConfigured()) {
    return null;
  }

  const environment = getPlaidEnvironment();
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[environment],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
          'Plaid-Version': '2020-09-14',
        },
      },
    })
  );
}

function buildMockAuth(initialAmount = 0) {
  let verificationStatus = 'automatically_verified';
  let isTokenized = false;
  const cents = Math.round((initialAmount - Math.floor(initialAmount)) * 100);

  if (cents === 88) {
    verificationStatus = 'pending_manual_verification';
  }
  if (cents === 77) {
    isTokenized = true;
  }

  return {
    accounts: [{ account_id: 'mock-account-001', verification_status: verificationStatus }],
    numbers: {
      ach: [
        {
          account: `xxxxxx${Math.floor(1000 + Math.random() * 9000)}`,
          routing: '011000015',
          isTokenized,
        },
      ],
    },
  };
}

function buildMockIdentity(userName = 'ClearFlow User') {
  let bankName = userName;
  if (userName.toLowerCase().includes('stepup')) {
    bankName = 'Dev M. User';
  } else if (userName.toLowerCase().includes('business')) {
    bankName = 'ClearFlow Operating Entity';
  }

  return {
    accounts: [{ owners: [{ names: [bankName] }] }],
  };
}

function buildIdentityMatchScore(userName = '', bankName = '') {
  const userParts = userName.toLowerCase().split(/\s+/).filter(Boolean);
  const bankParts = bankName.toLowerCase().split(/\s+/).filter(Boolean);

  if (!userParts.length || !bankParts.length) return { legal_name: { score: 0 } };
  let score = 40;
  if (userParts.length && userParts.every((part) => bankParts.includes(part))) {
    score = 95;
  } else if (userParts.some((part) => bankParts.includes(part))) {
    score = 75;
  }

  return { legal_name: { score } };
}

function buildMockTransactions(itemId) {
  const baseDate = new Date();
  const iso = (offset) => {
    const next = new Date(baseDate);
    next.setDate(baseDate.getDate() - offset);
    return next.toISOString().slice(0, 10);
  };

  return [
    {
      transaction_id: `${itemId}-txn-001`,
      account_id: `${itemId}-acct-001`,
      amount: 86.45,
      date: iso(1),
      name: 'Baselane Treasury Service Fee',
      pending: false,
      payment_channel: 'online',
      category: ['Bank Fees'],
    },
    {
      transaction_id: `${itemId}-txn-002`,
      account_id: `${itemId}-acct-001`,
      amount: 1420.0,
      date: iso(2),
      name: 'Vendor ACH Settlement',
      pending: false,
      payment_channel: 'online',
      category: ['Transfer'],
    },
    {
      transaction_id: `${itemId}-txn-003`,
      account_id: `${itemId}-acct-001`,
      amount: -2300.0,
      date: iso(3),
      name: 'Client Deposit',
      pending: false,
      payment_channel: 'online',
      category: ['Deposit'],
    },
  ];
}

async function getStoredItem(itemId) {
  const item = plaidItemStorageConfigured()
    ? await readPlaidItem(itemId)
    : await hydrateStoredItemByItemId(itemId);
  if (!item) {
    const error = new Error(`Plaid item ${itemId} is not connected in the current runtime.`);
    error.statusCode = 404;
    throw error;
  }
  return item;
}

function normalizePlaidTransactions(plaidTransactions = []) {
  return plaidTransactions.map((transaction) => ({
    transaction_id: transaction.transaction_id,
    account_id: transaction.account_id,
    amount: transaction.amount,
    date: transaction.authorized_date || transaction.date,
    name: transaction.name,
    pending: transaction.pending,
    payment_channel: transaction.payment_channel,
    category: transaction.personal_finance_category?.primary
      ? [
          transaction.personal_finance_category.primary,
          transaction.personal_finance_category.detailed,
        ].filter(Boolean)
      : transaction.category || [],
  }));
}

function allowBankingMocks() {
  return process.env.NODE_ENV !== 'production' && String(process.env.CLEARFLOW_ALLOW_BANKING_MOCKS || '').trim().toLowerCase() === 'true';
}

function mergePendingTransactions(existing = [], incoming = []) {
  const byId = new Map(
    existing
      .filter((transaction) => transaction?.transaction_id)
      .map((transaction) => [transaction.transaction_id, transaction])
  );

  incoming.forEach((transaction) => {
    if (transaction?.transaction_id) {
      byId.set(transaction.transaction_id, transaction);
    }
  });

  return Array.from(byId.values());
}

async function syncPlaidItemChanges(itemId) {
  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    const error = new Error('Plaid is not configured for live transaction sync.');
    error.statusCode = 503;
    throw error;
  }

  const item = await getStoredItem(itemId);
  let cursor = item.cursor || null;
  let hasMore = true;
  const added = [];
  const modified = [];
  const removedTransactionIds = [];

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: item.accessToken,
      cursor,
    });

    added.push(...(response.data.added || []));
    modified.push(...(response.data.modified || []));
    removedTransactionIds.push(
      ...(response.data.removed || [])
        .map((removed) => removed.transaction_id)
        .filter(Boolean)
    );
    cursor = response.data.next_cursor;
    hasMore = response.data.has_more;
  }

  transactionCursorStore.set(itemId, cursor);
  item.cursor = cursor;

  const normalizedAdded = normalizePlaidTransactions(added);
  const normalizedModified = normalizePlaidTransactions(modified);
  const removedSet = new Set([
    ...(item.removedTransactionIds || []),
    ...removedTransactionIds,
  ]);

  item.pendingAddedTransactions = mergePendingTransactions(
    item.pendingAddedTransactions || [],
    normalizedAdded
  ).filter((transaction) => !removedSet.has(transaction.transaction_id));
  item.pendingModifiedTransactions = mergePendingTransactions(
    item.pendingModifiedTransactions || [],
    normalizedModified
  ).filter((transaction) => !removedSet.has(transaction.transaction_id));
  item.removedTransactionIds = Array.from(removedSet);
  await savePersistedConnections(item.userId, item);

  return {
    added: normalizedAdded,
    modified: normalizedModified,
    removedTransactionIds,
  };
}

async function verifyPlaidWebhook(rawBody, verificationHeader, plaidClient) {
  if (!Buffer.isBuffer(rawBody) || !verificationHeader || !plaidClient) {
    return false;
  }

  const decoded = jwt.decode(verificationHeader, { complete: true });
  const header = decoded?.header;
  if (!header || header.alg !== 'ES256' || !header.kid) {
    return false;
  }

  const response = await plaidClient.webhookVerificationKeyGet({
    key_id: header.kid,
  });
  const publicKey = createPublicKey({
    key: response.data.key,
    format: 'jwk',
  });

  const payload = jwt.verify(verificationHeader, publicKey, {
    algorithms: ['ES256'],
    maxAge: '5m',
  });

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.request_body_sha256 !== 'string'
  ) {
    return false;
  }

  const actualHash = createHash('sha256').update(rawBody).digest('hex');
  const claimedHash = payload.request_body_sha256;
  if (actualHash.length !== claimedHash.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(actualHash, 'utf8'),
    Buffer.from(claimedHash, 'utf8')
  );
}

async function createLinkTokenWithFallbacks(plaidClient, payload) {
  const productSets = [
    [Products.Transactions],
  ];
  let lastError = null;

  for (const products of productSets) {
    try {
      const response = await plaidClient.linkTokenCreate({
        ...payload,
        products,
        optional_products: [Products.Auth],
        additional_consented_products: [Products.Investments],
      });
      return { response, products };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function getIdentityDataOrFallback(plaidClient, accessToken) {
  // Identity is a separately entitled Plaid product. Never infer a verified
  // bank-account owner from the user's self-entered display name.
  if (process.env.CLEARFLOW_PLAID_IDENTITY_ENABLED !== 'true') {
    return { accounts: [], identityAvailable: false };
  }
  try {
    const response = await plaidClient.identityGet({ access_token: accessToken });
    return { ...response.data, identityAvailable: true };
  } catch (error) {
    console.warn('Plaid Identity unavailable; owner identity remains unverified.', {
      error: error.response?.data?.error_message || error.message,
    });
    return { accounts: [], identityAvailable: false };
  }
}

router.post('/link_token', async (req, res) => {
  if ((req.body.userId || req.body.user_id) !== req.verifiedAccountId) return res.status(403).json({ error: 'Account mismatch.' });
  const userId = req.body.userId || req.body.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    return res.status(503).json({ error: 'Bank connections are unavailable until Plaid is configured.' });
  }

  try {
    const { response } = await createLinkTokenWithFallbacks(plaidClient, {
      user: { client_user_id: buildPlaidClientUserId(userId) },
      client_name: 'ClearFlow',
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook: getPlaidWebhookUrl(),
    });

    return res.json({ link_token: response.data.link_token });
  } catch (error) {
    return res.status(500).json({
      error: error.response?.data?.error_message || error.message || 'Failed to create Plaid link token.',
    });
  }
});

router.post('/exchange_public_token', async (req, res) => {
  if ((req.body.userId || req.body.user_id) !== req.verifiedAccountId) return res.status(403).json({ error: 'Account mismatch.' });
  const userId = req.body.userId || req.body.user_id;
  const publicToken = req.body.public_token || req.body.publicToken;
  const userName = req.body.userName || req.body.user_name || 'ClearFlow User';

  if (!userId || !publicToken) {
    return res.status(400).json({ error: 'userId and public_token are required' });
  }

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    return res.status(503).json({ error: 'Bank connections are unavailable until Plaid is configured.' });
  }

  try {
    const exchange = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
    let authResponse = null;
    try {
      authResponse = (await plaidClient.authGet({ access_token: accessToken })).data;
    } catch (error) {
      const code = error.response?.data?.error_code;
      if (!['PRODUCT_NOT_SUPPORTED', 'PRODUCT_NOT_READY', 'ADDITIONAL_CONSENT_REQUIRED', 'NO_AUTH_ACCOUNTS', 'INVALID_PRODUCT'].includes(code)) throw error;
      console.info('Optional Plaid Auth unavailable.', { code });
    }
    const identityData = await getIdentityDataOrFallback(plaidClient, accessToken, userName);

    itemStore.set(itemId, {
      userId,
      accessToken,
      itemId,
      authResponse,
      identityData,
      accounts: accountsResponse.data.accounts,
    });

    accountsResponse.data.accounts.forEach((account) => {
      accountIndex.set(account.account_id, itemId);
    });
    await savePersistedConnections(userId, itemStore.get(itemId));

    const bankOwnerName =
      identityData.accounts?.[0]?.owners?.[0]?.names?.[0] || '';


    return res.json({
      authResponse,
      identityData,
      identityMatchScores: buildIdentityMatchScore(userName, bankOwnerName),
      itemId,
      linkedAccounts: accountsResponse.data.accounts.map((account) => ({
        accountId: account.account_id,
        name: account.name || account.official_name || 'Connected account',
        mask: account.mask,
        type: account.type,
        subtype: account.subtype,
        currentBalance:
          typeof account.balances?.current === 'number' ? account.balances.current : undefined,
        availableBalance:
          typeof account.balances?.available === 'number'
            ? account.balances.available
            : undefined,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      error:
        error.response?.data?.error_message || error.message || 'Failed to exchange Plaid public token.',
    });
  }
});

router.post('/auth/get', async (req, res) => {
  const verifiedAccountId = req.verifiedAccountId;
  const itemId = req.body.itemId || req.body.item_id;
  const initialAmount = Number(req.body.initialAmount || req.body.initial_amount || 0);
  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    return res.status(503).json({ error: 'Plaid live banking is not configured.' });
  }

  try {
    const item = await getStoredItem(itemId);
    if (item.userId !== verifiedAccountId) return res.status(403).json({ error: 'Bank connection access denied.' });
    const response = await plaidClient.authGet({ access_token: item.accessToken });
    item.authResponse = response.data;
    return res.json(response.data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.response?.data?.error_message || error.message || 'Failed to fetch account auth details.',
    });
  }
});

router.post('/identity/get', async (req, res) => {
  const verifiedAccountId = req.verifiedAccountId;
  const itemId = req.body.itemId || req.body.item_id;
  const userName = req.body.userName || req.body.user_name || 'ClearFlow User';
  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    return res.status(503).json({ error: 'Plaid live banking is not configured.' });
  }

  try {
    const item = await getStoredItem(itemId);
    if (item.userId !== verifiedAccountId) return res.status(403).json({ error: 'Bank connection access denied.' });
    const identityData = await getIdentityDataOrFallback(
      plaidClient,
      item.accessToken,
      userName
    );
    item.identityData = identityData;
    return res.json(identityData);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.response?.data?.error_message || error.message || 'Failed to fetch identity data.',
    });
  }
});

router.post('/identity/match', async (req, res) => {
  const userName = req.body.userName || req.body.user_name || '';
  const bankName = req.body.bankName || req.body.bank_name || '';
  return res.json(buildIdentityMatchScore(userName, bankName));
});

router.post('/signal/prepare', async (_req, res) => {
  return res.json({ status: 'ok' });
});

router.post('/signal/evaluate', async (req, res) => {
  const verifiedAccountId = req.verifiedAccountId;
  const itemId = req.body.itemId || req.body.item_id;
  const accountId = req.body.accountId || req.body.account_id;
  const amount = Number(req.body.amount || 0);
  const clientTransactionId =
    req.body.clientTransactionId || req.body.client_transaction_id || `signal-${Date.now()}`;
  const user = req.body.user || {};
  const device = req.body.device || {};

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    return res.status(503).json({ error: 'Plaid live banking is not configured.' });
  }

  try {
    const resolvedItemId = itemId || accountIndex.get(accountId);
    const item = await getStoredItem(resolvedItemId);
    if (item.userId !== verifiedAccountId) return res.status(403).json({ error: 'Bank connection access denied.' });
    const response = await plaidClient.signalEvaluate({
      access_token: item.accessToken,
      account_id: accountId,
      amount,
      client_transaction_id: clientTransactionId,
      user,
      device,
    });
    return res.json(response.data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.response?.data?.error_message || error.message || 'Failed to evaluate ACH risk.',
    });
  }
});

router.get('/transactions/:itemId', async (req, res) => {
  const verifiedAccountId = req.verifiedAccountId;
  const { itemId } = req.params;
  const plaidClient = getPlaidClient();

  if (!plaidClient) {
    if (allowBankingMocks()) {
      return res.json(buildMockTransactions(itemId));
    }
    return res.status(503).json({ error: 'Plaid live banking is not configured.' });
  }

  try {
    const item = await getStoredItem(itemId);
    if (item.userId !== verifiedAccountId) return res.status(403).json({ error: 'Bank connection access denied.' });
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const response = await plaidClient.transactionsGet({
      access_token: item.accessToken,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
      options: { count: 100 },
    });

    return res.json(normalizePlaidTransactions(response.data.transactions));
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.response?.data?.error_message || error.message || 'Failed to fetch transactions.',
    });
  }
});

router.post('/transactions/sync', async (req, res) => {
  const verifiedAccountId = req.verifiedAccountId;
  const itemId = req.body.itemId || req.body.item_id;
  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    if (allowBankingMocks()) {
      return res.json({
        added: buildMockTransactions(itemId),
        modified: [],
        removedTransactionIds: [],
      });
    }
    return res.status(503).json({ error: 'Plaid live banking is not configured.' });
  }

  try {
    const item = await getStoredItem(itemId);
    if (item.userId !== verifiedAccountId) return res.status(403).json({ error: 'Bank connection access denied.' });
    // A frozen delivery is replayed unchanged until its durable workspace receipt is acknowledged.
    if (item.delivery) return res.json(item.delivery);
    await syncPlaidItemChanges(itemId);
    const syncedItem = await getStoredItem(itemId);
    const staged = stagePlaidDelivery(syncedItem);
    if (staged.changed) await savePersistedConnections(syncedItem.userId, syncedItem);
    return res.json(staged.delivery);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.response?.data?.error_message || error.message || 'Failed to sync transactions.',
    });
  }
});

router.post('/transactions/ack', async (req, res) => {
  const { itemId, deliveryId } = req.body || {};
  if (typeof itemId !== 'string' || !itemId || typeof deliveryId !== 'string' || !deliveryId) {
    return res.status(400).json({ error: 'Item and delivery identifiers are required.' });
  }
  try {
    const item = await getStoredItem(itemId);
    if (item.userId !== req.verifiedAccountId) return res.status(403).json({ error: 'Bank connection access denied.' });
    const workspace = isConfiguredOwnerAccount(req.verifiedAccountId)
      ? (await loadOwnerWorkspace(req.verifiedAccountId))?.app_data
      : await loadAccountAppData(req.verifiedAccountId);
    if (acknowledgePlaidDelivery(item, deliveryId, workspace)) await savePersistedConnections(item.userId, item);
    return res.json({ acknowledged: true, deliveryId });
  } catch (error) {
    return res.status(error.statusCode || 503).json({ error: error.message || 'Bank delivery acknowledgement unavailable.' });
  }
});

router.post('/webhook', async (req, res) => {
  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    return res.status(503).send('Plaid is not configured.');
  }

  const rawBody = req.body;
  const verificationHeader = req.get('Plaid-Verification');

  try {
    const verified = await verifyPlaidWebhook(rawBody, verificationHeader, plaidClient);
    if (!verified) {
      return res.status(401).send('Invalid Plaid webhook signature.');
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    if (
      payload.webhook_type === 'TRANSACTIONS' &&
      payload.webhook_code === 'SYNC_UPDATES_AVAILABLE' &&
      payload.item_id
    ) {
      await syncPlaidItemChanges(payload.item_id);
    }

    return res.status(200).send('Webhook processed.');
  } catch (error) {
    console.error('Plaid webhook processing failed.', error);
    return res.status(500).send('Webhook processing failed.');
  }
});

export default router;
