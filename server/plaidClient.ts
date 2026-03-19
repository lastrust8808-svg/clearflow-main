// server/plaidClient.ts
// Centralized configuration and instantiation of the Plaid API client.

import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import dotenv from 'dotenv';

dotenv.config();

const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

if (!process.env.PLAID_CLIENT_ID) {
  console.error("PLAID_CLIENT_ID is not set.");
}
if (!process.env.PLAID_SECRET) {
  console.error("PLAID_SECRET is not set.");
}

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': process.env.PLAID_SECRET!,
      'Plaid-Version': '2020-09-14',
    },
  },
});

export const plaidClient = new PlaidApi(plaidConfig);