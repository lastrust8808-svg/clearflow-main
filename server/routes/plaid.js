import express from 'express';
import { createHash } from 'node:crypto';
import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from 'plaid';
import { loadAccountPlaidVault, saveAccountPlaidVault } from '../services/accountStorage.js';
import { decryptJson, encryptJson } from '../utils/secureVault.js';

const router = express.Router();

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

async function savePersistedConnections(userId) {
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
    }))
  );

  await saveAccountPlaidVault(userId, { encryptedPayload });
}

async function hydrateStoredItemByItemId(itemId) {
  if (!itemId) {
    return null;
  }

  if (itemStore.has(itemId)) {
    return itemStore.get(itemId);
  }

  try {
    const { readdir } = await import('node:fs/promises');
    const path = await import('node:path');
    const accountsRoot = path.resolve(process.cwd(), 'server', 'storage-data', 'accounts');
    const accountDirectories = await readdir(accountsRoot, { withFileTypes: true });

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
  const item = itemStore.get(itemId) || (await hydrateStoredItemByItemId(itemId));
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

async function createLinkTokenWithFallbacks(plaidClient, payload) {
  const productSets = [
    [Products.Auth, Products.Transactions],
    [Products.Auth],
    [Products.Transactions],
  ];
  let lastError = null;

  for (const products of productSets) {
    try {
      const response = await plaidClient.linkTokenCreate({
        ...payload,
        products,
      });
      return { response, products };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function getIdentityDataOrFallback(plaidClient, accessToken, userName) {
  try {
    const response = await plaidClient.identityGet({ access_token: accessToken });
    return response.data;
  } catch (error) {
    console.warn('Plaid identity product unavailable for connected item; falling back to inferred identity.', {
      error: error.response?.data?.error_message || error.message,
    });
    return buildMockIdentity(userName);
  }
}

router.post('/link_token', async (req, res) => {
  const userId = req.body.userId || req.body.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    return res.json({ link_token: `link-sandbox-mock-${Date.now()}` });
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
  const userId = req.body.userId || req.body.user_id;
  const publicToken = req.body.public_token || req.body.publicToken;
  const userName = req.body.userName || req.body.user_name || 'ClearFlow User';

  if (!userId || !publicToken) {
    return res.status(400).json({ error: 'userId and public_token are required' });
  }

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    const itemId = `mock-item-${Date.now()}`;
    const authResponse = buildMockAuth();
    const identityData = buildMockIdentity(userName);
    const bankOwnerName = identityData.accounts[0]?.owners?.[0]?.names?.[0] || '';
    itemStore.set(itemId, {
      userId,
      accessToken: `mock-access-${Date.now()}`,
      itemId,
      authResponse,
      identityData,
      accounts: [
        {
          account_id: authResponse.accounts[0].account_id,
          name: 'Mock Checking',
          mask: authResponse.numbers.ach[0].account.slice(-4),
          type: 'depository',
          subtype: 'checking',
        },
      ],
    });
    accountIndex.set(authResponse.accounts[0].account_id, itemId);
    await savePersistedConnections(userId);

    return res.json({
      authResponse,
      identityData,
      identityMatchScores: buildIdentityMatchScore(userName, bankOwnerName),
      itemId,
      linkedAccounts: [
        {
          accountId: authResponse.accounts[0].account_id,
          name: 'Mock Checking',
          mask: authResponse.numbers.ach[0].account.slice(-4),
          type: 'depository',
          subtype: 'checking',
          currentBalance: 2500,
          availableBalance: 2500,
        },
      ],
    });
  }

  try {
    const exchange = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
    const authResponse = await plaidClient.authGet({ access_token: accessToken });
    const identityData = await getIdentityDataOrFallback(plaidClient, accessToken, userName);

    itemStore.set(itemId, {
      userId,
      accessToken,
      itemId,
      authResponse: authResponse.data,
      identityData,
      accounts: accountsResponse.data.accounts,
    });

    accountsResponse.data.accounts.forEach((account) => {
      accountIndex.set(account.account_id, itemId);
    });
    await savePersistedConnections(userId);

    const bankOwnerName =
      identityData.accounts?.[0]?.owners?.[0]?.names?.[0] || userName;

    return res.json({
      authResponse: authResponse.data,
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
  const itemId = req.body.itemId || req.body.item_id;
  const initialAmount = Number(req.body.initialAmount || req.body.initial_amount || 0);
  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    return res.json(buildMockAuth(initialAmount));
  }

  try {
    const item = await getStoredItem(itemId);
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
  const itemId = req.body.itemId || req.body.item_id;
  const userName = req.body.userName || req.body.user_name || 'ClearFlow User';
  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    return res.json(buildMockIdentity(userName));
  }

  try {
    const item = await getStoredItem(itemId);
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
  const itemId = req.body.itemId || req.body.item_id;
  const accountId = req.body.accountId || req.body.account_id;
  const amount = Number(req.body.amount || 0);
  const clientTransactionId =
    req.body.clientTransactionId || req.body.client_transaction_id || `signal-${Date.now()}`;
  const user = req.body.user || {};
  const device = req.body.device || {};

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    const cents = Math.round((amount - Math.floor(amount)) * 100);
    const decision = cents === 99 ? 'REROUTE' : 'ACCEPT';
    return res.json({
      decision,
      ruleset_key: 'clearflowach',
      signal: {
        ruleset: {
          result: decision,
          triggered_rule_details:
            decision === 'REROUTE'
              ? { internal_note: 'High risk score detected in mock evaluation.' }
              : undefined,
        },
      },
    });
  }

  try {
    const resolvedItemId = itemId || accountIndex.get(accountId);
    const item = await getStoredItem(resolvedItemId);
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
  const { itemId } = req.params;
  const plaidClient = getPlaidClient();

  if (!plaidClient) {
    return res.json(buildMockTransactions(itemId));
  }

  try {
    const item = await getStoredItem(itemId);
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
  const itemId = req.body.itemId || req.body.item_id;
  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    return res.json(buildMockTransactions(itemId));
  }

  try {
    const item = await getStoredItem(itemId);
    let cursor = transactionCursorStore.get(itemId) || item.cursor || null;
    let hasMore = true;
    const added = [];

    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: item.accessToken,
        cursor,
      });

      added.push(...response.data.added);
      cursor = response.data.next_cursor;
      hasMore = response.data.has_more;
    }

    transactionCursorStore.set(itemId, cursor);
    item.cursor = cursor;
    await savePersistedConnections(item.userId);
    return res.json(normalizePlaidTransactions(added));
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.response?.data?.error_message || error.message || 'Failed to sync transactions.',
    });
  }
});

router.post('/webhook', async (req, res) => {
  res.status(200).send('Webhook received.');
});

export default router;
