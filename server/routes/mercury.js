import express from 'express';
import crypto from 'node:crypto';
import {
  getMercuryPaymentStatus,
  getMercuryTransactionById,
  isMercuryExecutionConfigured,
} from '../services/mercuryExecution.js';
import {
  ownerAccountIdFromEmail,
  recordOwnerProviderEvent,
  applyMercuryProviderUpdateToOwnerWorkspace,
} from '../services/ownerDatabase.js';

const router = express.Router();

function getOwnerAccountId() {
  return ownerAccountIdFromEmail(process.env.CLEARFLOW_OWNER_EMAIL || '');
}

function verifyMercuryWebhook(rawBody, signatureHeader) {
  const secret = String(process.env.MERCURY_WEBHOOK_SECRET || '').trim();
  if (!secret || !Buffer.isBuffer(rawBody) || !signatureHeader) {
    return false;
  }

  const parts = String(signatureHeader)
    .split(',')
    .map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signature = parts.find((part) => part.startsWith('v1='))?.slice(3);

  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return false;
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (ageSeconds > 300) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  if (expected.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signature, 'utf8')
  );
}

router.get('/status', (_req, res) => {
  return res.status(200).json({
    success: true,
    configured: isMercuryExecutionConfigured(),
    webhookVerificationConfigured: Boolean(
      String(process.env.MERCURY_WEBHOOK_SECRET || '').trim()
    ),
    mode: isMercuryExecutionConfigured() ? 'approval_required' : 'disabled',
  });
});

router.get('/payment-status/:requestId', async (req, res) => {
  if (!isMercuryExecutionConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Mercury API is not configured on the ClearFlow server.',
    });
  }

  try {
    const status = await getMercuryPaymentStatus(req.params.requestId);
    const ownerAccountId = getOwnerAccountId();
    const relatedTransaction = Array.isArray(status.transactions)
      ? status.transactions[0] || null
      : null;

    let workspaceUpdate = null;
    if (ownerAccountId) {
      workspaceUpdate = await applyMercuryProviderUpdateToOwnerWorkspace({
        accountId: ownerAccountId,
        requestId: req.params.requestId,
        approvalRequest: status.approvalRequest,
        transaction: relatedTransaction,
        actor: 'mercury_status_poll',
      });
    }

    return res.status(200).json({
      success: true,
      ...status,
      workspaceUpdated: Boolean(workspaceUpdate?.applied),
    });
  } catch (error) {
    return res.status(error.statusCode || 502).json({
      success: false,
      error: error instanceof Error ? error.message : 'Mercury status lookup failed.',
    });
  }
});

router.post('/webhook', async (req, res) => {
  const rawBody = req.body;
  const signatureHeader = req.get('Mercury-Signature');

  if (!verifyMercuryWebhook(rawBody, signatureHeader)) {
    return res.status(401).send('Invalid Mercury webhook signature.');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid Mercury webhook payload.');
  }

  try {
    let transaction = null;
    if (
      event?.resourceType === 'transaction' &&
      event?.resourceId &&
      isMercuryExecutionConfigured()
    ) {
      try {
        transaction = await getMercuryTransactionById(event.resourceId);
      } catch (error) {
        console.warn('Mercury transaction detail lookup failed for webhook event.', error);
      }
    }

    const ownerAccountId = getOwnerAccountId();
    if (ownerAccountId) {
      await recordOwnerProviderEvent({
        accountId: ownerAccountId,
        provider: 'mercury',
        eventId: event?.id || `mercury-${Date.now()}`,
        resourceType: event?.resourceType || null,
        resourceId: event?.resourceId || null,
        occurredAt: event?.occurredAt || null,
        payload: {
          event,
          transaction,
        },
      });

      if (transaction?.requestId) {
        await applyMercuryProviderUpdateToOwnerWorkspace({
          accountId: ownerAccountId,
          requestId: transaction.requestId,
          transaction,
          actor: 'mercury_webhook',
        });
      }
    }

    return res.status(200).send('Webhook processed.');
  } catch (error) {
    console.error('Mercury webhook processing failed.', error);
    return res.status(500).send('Webhook processing failed.');
  }
});

export default router;
