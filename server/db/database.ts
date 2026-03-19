// server/db/database.ts
// A minimal, in-memory database simulation for demonstration purposes.
// In a real application, this would be replaced with a persistent database (e.g., PostgreSQL).

import { AccountBase } from 'plaid';
import { encrypt, decrypt } from '../utils/encryption.js';
import { v4 as uuidv4 } from 'uuid';

// --- In-Memory Data Stores ---
const users: Map<string, any> = new Map();
const items: Map<string, any> = new Map(); // key is plaid_item_id
const accounts: Map<string, any> = new Map(); // key is plaid_account_id
const identities: Map<string, any> = new Map(); // key is plaid_account_id
const signalEvaluations: Map<string, any> = new Map(); // key is client_transaction_id

// --- Helper Functions ---

export const saveItem = async (userId: string, itemId: string, accessToken: string, institutionId: string) => {
  const encryptedToken = await encrypt(accessToken);
  items.set(itemId, {
    id: uuidv4(),
    user_id: userId,
    plaid_item_id: itemId,
    access_token_encrypted: encryptedToken,
    institution_id: institutionId,
    status: 'good',
    cursor: null,
    created_at: new Date(),
    updated_at: new Date(),
  });
};

export const saveAccounts = async (userId: string, itemId: string, plaidAccounts: AccountBase[]) => {
  plaidAccounts.forEach(acc => {
    accounts.set(acc.account_id, {
      id: uuidv4(),
      user_id: userId,
      plaid_item_id: itemId,
      plaid_account_id: acc.account_id,
      mask: acc.mask,
      name: acc.name,
      type: acc.type,
      subtype: acc.subtype,
      created_at: new Date(),
    });
  });
};

export const getItemByItemId = async (itemId: string): Promise<{ access_token: string }> => {
  const item = items.get(itemId);
  if (!item) throw new Error(`Item with id ${itemId} not found.`);
  const accessToken = await decrypt(item.access_token_encrypted);
  return { access_token: accessToken };
};

export const getItemByAccountId = async (accountId: string): Promise<{ access_token: string, item_id: string }> => {
  const account = accounts.get(accountId);
  if (!account) throw new Error(`Account with id ${accountId} not found.`);
  
  const item = items.get(account.plaid_item_id);
  if (!item) throw new Error(`Item for account ${accountId} not found.`);

  const accessToken = await decrypt(item.access_token_encrypted);
  return { access_token: accessToken, item_id: item.plaid_item_id };
};

export const getItemByClientTransactionId = async (clientTransactionId: string): Promise<{ access_token: string }> => {
    const evaluation = signalEvaluations.get(clientTransactionId);
    if (!evaluation) throw new Error(`Evaluation with client_transaction_id ${clientTransactionId} not found.`);
    return getItemByAccountId(evaluation.plaid_account_id);
};

export const updateIdentities = async (itemId: string, identityAccounts: any[]) => {
  identityAccounts.forEach(acc => {
    const owners = acc.owners;
    identities.set(acc.account_id, {
        id: uuidv4(),
        plaid_account_id: acc.account_id,
        legal_name: owners[0]?.names[0],
        addresses: owners[0]?.addresses,
        phones: owners[0]?.phone_numbers,
        emails: owners[0]?.emails,
        updated_at: new Date(),
    });
  });
};

export const updateItemStatus = async (itemId: string, status: string) => {
    const item = items.get(itemId);
    if (item) {
        item.status = status;
        item.updated_at = new Date();
    }
};

export const saveSignalEvaluation = async (accountId: string, clientTransactionId: string, amount: number, response: any) => {
    const account = accounts.get(accountId);
    signalEvaluations.set(clientTransactionId, {
        id: uuidv4(),
        plaid_account_id: accountId,
        plaid_item_id: account.plaid_item_id,
        client_transaction_id: clientTransactionId,
        amount,
        evaluate_response: response,
        created_at: new Date(),
    });
};

export const updateSignalDecisionReportStatus = async (clientTransactionId: string, reported: boolean) => {
    const evaluation = signalEvaluations.get(clientTransactionId);
    if (evaluation) {
        evaluation.decision_reported = reported;
    }
};

export const updateSignalReturnReportStatus = async (clientTransactionId: string, reported: boolean) => {
    const evaluation = signalEvaluations.get(clientTransactionId);
    if (evaluation) {
        evaluation.return_reported = reported;
    }
};