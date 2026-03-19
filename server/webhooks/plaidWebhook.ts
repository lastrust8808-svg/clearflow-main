// server/webhooks/plaidWebhook.ts
// Dedicated handler for processing incoming webhooks from Plaid.

import { Request, Response } from 'express';
import { plaidClient } from '../plaidClient.js';
import * as db from '../db/database.js';

export const handlePlaidWebhook = async (req: Request, res: Response) => {
  // Acknowledge the webhook immediately to prevent retries.
  res.status(200).send('Webhook received.');

  // TODO: Add webhook verification for production security.
  // const verificationHeader = req.header('plaid-verification');
  // plaid.webhookVerification.verify(req.rawBody, verificationHeader, keyId);

  const { webhook_type, webhook_code, item_id, ...body } = req.body;

  console.log(`Received webhook: ${webhook_type} | ${webhook_code} for item ${item_id}`);

  try {
    switch (webhook_type) {
      case 'IDENTITY':
        if (webhook_code === 'DEFAULT_UPDATE') {
          console.log(`-> Identity data updated for item ${item_id}. Refreshing...`);
          const { access_token } = await db.getItemByItemId(item_id);
          const identityResponse = await plaidClient.identityGet({ access_token });

          await db.updateIdentities(item_id, identityResponse.data.accounts);
          console.log(`-> Successfully updated identity for item ${item_id}.`);
        }
        break;

      case 'TRANSACTIONS':
        // Handle transaction webhooks (e.g., SYNC_UPDATES_AVAILABLE)
        console.log(`-> Transactions update available for item ${item_id}.`);
        // You would trigger a background job to call /transactions/sync here.
        break;

      case 'ITEM':
         if (webhook_code === 'ERROR') {
            console.error(`-> Item error for ${item_id}:`, body.error);
            await db.updateItemStatus(item_id, 'error');
         }
        break;

      case 'PARTNER':
        if (webhook_code === 'END_CUSTOMER_OAUTH_STATUS_UPDATED') {
          console.log(`-> [Reseller] OAuth status update for customer ${body.end_customer_client_id} at institution ${body.institution_id}. New status: ${body.status}`);
          // Persist this status update in a partner-specific table.
        }
        break;

      default:
        console.log(`-> Unhandled webhook type: ${webhook_type}`);
    }
  } catch (error) {
    // Log the error but do not throw, as the response has already been sent.
    console.error(`Error processing webhook for item ${item_id}:`, error.response?.data || error.message);
  }
};