import express from 'express';
import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from 'plaid';

const router = express.Router();

const itemStore = new Map();
const accountIndex = new Map();
const transactionCursorStore = new Map();

function isPlaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

function getPlaidClient() {
  if (!isPlaidConfigured()) {
    return null;
  }

  const environment = process.env.PLAID_ENV || 'sandbox';
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

function getStoredItem(itemId) {
  const item = itemStore.get(itemId);
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
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(userId) },
      client_name: 'ClearFlow',
      products: [Products.Auth, Products.Identity, Products.Transactions, Products.Signal],
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
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

    return res.json({
      authResponse,
      identityData,
      identityMatchScores: buildIdentityMatchScore(userName, bankOwnerName),
      itemId,
    });
  }

  try {
    const exchange = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
    const authResponse = await plaidClient.authGet({ access_token: accessToken });
    const identityResponse = await plaidClient.identityGet({ access_token: accessToken });

    itemStore.set(itemId, {
      userId,
      accessToken,
      itemId,
      authResponse: authResponse.data,
      identityData: identityResponse.data,
      accounts: accountsResponse.data.accounts,
    });

    accountsResponse.data.accounts.forEach((account) => {
      accountIndex.set(account.account_id, itemId);
    });

    const bankOwnerName =
      identityResponse.data.accounts?.[0]?.owners?.[0]?.names?.[0] || userName;

    return res.json({
      authResponse: authResponse.data,
      identityData: identityResponse.data,
      identityMatchScores: buildIdentityMatchScore(userName, bankOwnerName),
      itemId,
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
    const item = getStoredItem(itemId);
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
    const item = getStoredItem(itemId);
    const response = await plaidClient.identityGet({ access_token: item.accessToken });
    item.identityData = response.data;
    return res.json(response.data);
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
    const item = getStoredItem(resolvedItemId);
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
    const item = getStoredItem(itemId);
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
    const item = getStoredItem(itemId);
    let cursor = transactionCursorStore.get(itemId) || null;
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
