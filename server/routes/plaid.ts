// server/routes/plaid.ts
// Implements all Plaid-facing API endpoints for the Clear-Flow application.

import express from 'express';
import { CountryCode, Products } from 'plaid';
import { plaidClient } from '../plaidClient.js';
import { handlePlaidWebhook } from '../webhooks/plaidWebhook.js';
import * as db from '../db/database.js';

const router = express.Router();

// --- 1. Create Link Token ---
// Creates a short-lived token required to initialize the Plaid Link client-side.
router.post('/link-token', async (req, res, next) => {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const tokenResponse = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(user_id) },
      client_name: 'Clear-Flow',
      products: [Products.Auth, Products.Identity, Products.Transactions, Products.Signal],
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook: process.env.PLAID_WEBHOOK_URL, // This should be your publicly accessible server URL, e.g., from ngrok
    });

    res.json({ link_token: tokenResponse.data.link_token });
  } catch (error) {
    console.error('/link-token error:', error.response?.data || error.message);
    next(error);
  }
});

// --- 2. Exchange Public Token ---
// Swaps the temporary public_token from Plaid Link for a persistent access_token.
router.post('/exchange', async (req, res, next) => {
  try {
    const { user_id, public_token } = req.body;
    if (!user_id || !public_token) {
      return res.status(400).json({ error: 'user_id and public_token are required' });
    }

    const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeResponse.data;

    const itemResponse = await plaidClient.itemGet({ access_token });
    const institution = itemResponse.data.item.institution_id;
    
    const accountsResponse = await plaidClient.accountsGet({ access_token });

    // In a real app, this is where you securely save the item and accounts to your database.
    await db.saveItem(user_id, item_id, access_token, institution);
    await db.saveAccounts(user_id, item_id, accountsResponse.data.accounts);

    console.log(`Successfully exchanged token for item_id: ${item_id}, user: ${user_id}`);
    res.json({ item_id, accounts: accountsResponse.data.accounts });
  } catch (error) {
    console.error('/exchange error:', error.response?.data || error.message);
    next(error);
  }
});

// --- 3. Webhook Receiver ---
// Handles asynchronous updates from Plaid.
router.post('/webhook', handlePlaidWebhook);


// --- 4. Signal Evaluate ---
// Evaluates the ACH return risk for a proposed transaction.
router.post('/signal/evaluate', async (req, res, next) => {
  try {
    const { account_id, amount, client_transaction_id, ruleset_key, user, device } = req.body;
    const { access_token } = await db.getItemByAccountId(account_id);

    const evaluateResponse = await plaidClient.signalEvaluate({
      access_token,
      account_id,
      client_transaction_id,
      amount,
      ruleset_key, // Optional: for custom rulesets
      user: user || {},   // Recommended for better risk scores
      device: device || {}, // Recommended for better risk scores
    });

    await db.saveSignalEvaluation(account_id, client_transaction_id, amount, evaluateResponse.data);

    res.json(evaluateResponse.data);
  } catch (error) {
    console.error('/signal/evaluate error:', error.response?.data || error.message);
    next(error);
  }
});

// --- 5. Signal Decision Report ---
// Reports back to Plaid whether the transaction was initiated.
router.post('/signal/decision-report', async (req, res, next) => {
  try {
    const { client_transaction_id, initiated } = req.body;

    const reportResponse = await plaidClient.signalDecisionReport({
      client_transaction_id,
      initiated: Boolean(initiated),
    });

    await db.updateSignalDecisionReportStatus(client_transaction_id, true);
    res.json(reportResponse.data);
  } catch (error) {
    console.error('/signal/decision-report error:', error.response?.data || error.message);
    next(error);
  }
});

// --- 6. Signal Return Report ---
// Reports an ACH return back to Plaid to improve the risk model.
router.post('/signal/return-report', async (req, res, next) => {
  try {
    const { client_transaction_id, return_code } = req.body;

    const reportResponse = await plaidClient.signalReturnReport({
      client_transaction_id,
      return_code,
    });
    
    await db.updateSignalReturnReportStatus(client_transaction_id, true);
    res.json(reportResponse.data);
  } catch (error) {
    console.error('/signal/return-report error:', error.response?.data || error.message);
    next(error);
  }
});

// --- 7. Realtime Balance ---
// Fetches the real-time balance for a specific account.
router.post('/balance/get', async (req, res, next) => {
  try {
    const { account_id } = req.body;
    const { access_token } = await db.getItemByAccountId(account_id);

    const balanceResponse = await plaidClient.accountsBalanceGet({
      access_token,
      options: { account_ids: [account_id] },
    });

    res.json(balanceResponse.data);
  } catch (error) {
    console.error('/balance/get error:', error.response?.data || error.message);
    next(error);
  }
});

export default router;