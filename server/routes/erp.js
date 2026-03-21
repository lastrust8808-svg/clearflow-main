import express from 'express';
import { randomUUID } from 'node:crypto';
import { isMailerConfigured, sendInvoiceEmail } from '../utils/mailer.js';
import { decideRail } from '../policy/railPolicy.js';
import { isValidRoutingNumber } from '../utils/routingValidator.js';

const router = express.Router();

const invoiceDeliveryJobs = [];
const invoiceExportJobs = [];
const statementImportJobs = [];
const reconciliationCloseJobs = [];
const settlementExecutionJobs = [];

router.post('/invoice-deliveries', async (req, res) => {
  const {
    invoiceId,
    entityId,
    invoiceNumber,
    deliveryMethod,
    recipientEmail,
    internalDeliveryTarget,
    emailSubject,
    emailTextBody,
    emailHtmlBody,
    attachmentFileName,
    attachmentHtml,
    replyTo,
    fromName,
  } = req.body || {};

  if (!invoiceId || !entityId || !invoiceNumber) {
    return res.status(400).json({ success: false, error: 'Missing invoice delivery payload.' });
  }

  const job = {
    id: randomUUID(),
    invoiceId,
    entityId,
    invoiceNumber,
    deliveryMethod: deliveryMethod || 'manual',
    recipientEmail: recipientEmail || null,
    internalDeliveryTarget: internalDeliveryTarget || null,
    status: 'queued',
    operation: 'send',
    queuedAt: new Date().toISOString(),
  };

  if (job.deliveryMethod === 'email' && recipientEmail) {
    if (isMailerConfigured()) {
      try {
        await sendInvoiceEmail({
          to: recipientEmail,
          subject: emailSubject || `Invoice ${invoiceNumber}`,
          text: emailTextBody || `Your invoice ${invoiceNumber} is attached.`,
          html: emailHtmlBody || `<p>Your invoice <strong>${invoiceNumber}</strong> is attached.</p>`,
          attachmentFileName,
          attachmentHtml,
          replyTo,
          fromName,
        });
        job.status = 'sent';
        job.sentAt = new Date().toISOString();
        job.deliveryChannel = 'smtp';
      } catch (error) {
        job.status = 'fallback_required';
        job.deliveryChannel = 'manual';
        job.fallbackReason =
          error instanceof Error ? error.message : 'SMTP delivery failed.';
      }
    } else {
      job.status = 'fallback_required';
      job.deliveryChannel = 'manual';
      job.fallbackReason = 'SMTP is not configured on the server.';
    }
  } else if (job.deliveryMethod === 'internal_user') {
    job.deliveryChannel = 'internal';
  } else {
    job.deliveryChannel = 'manual';
  }

  invoiceDeliveryJobs.unshift(job);
  return res.status(201).json({ success: true, job });
});

router.post('/invoice-exports', (req, res) => {
  const { invoiceId, entityId, invoiceNumber } = req.body || {};

  if (!invoiceId || !entityId || !invoiceNumber) {
    return res.status(400).json({ success: false, error: 'Missing invoice export payload.' });
  }

  const job = {
    id: randomUUID(),
    invoiceId,
    entityId,
    invoiceNumber,
    status: 'queued',
    operation: 'export',
    queuedAt: new Date().toISOString(),
  };

  invoiceExportJobs.unshift(job);
  return res.status(201).json({ success: true, job });
});

router.post('/settlements/execute', (req, res) => {
  const {
    entityId,
    paymentId,
    settlementId,
    amount,
    currency,
    direction,
    method,
    urgency,
    sourceBankAccount,
    sourceLedgerAccount,
    vendorInstruction,
  } = req.body || {};

  if (!entityId || !paymentId || !settlementId || !amount) {
    return res
      .status(400)
      .json({ success: false, error: 'Missing settlement execution payload.' });
  }

  const routingNumber = vendorInstruction?.routingNumber || '';
  const accountNumber = vendorInstruction?.accountNumber || '';
  const vendorInstructionVerified =
    isValidRoutingNumber(routingNumber) && /^\d{4,17}$/.test(accountNumber);

  const sourceType = sourceBankAccount
    ? 'bank_account'
    : sourceLedgerAccount
      ? 'ledger_account'
      : 'manual_remittance';

  let rail = 'None';
  let executionReason = 'No settlement rail available.';
  let processorStatus = 'blocked';
  let verificationStatus = 'exception';
  let verificationMethod = 'manual_override';

  if (direction === 'outgoing' && (method === 'ach' || method === 'wire') && vendorInstructionVerified) {
    if (sourceType === 'ledger_account' && sourceLedgerAccount && sourceLedgerAccount.remittanceEligible === false) {
      const execution = {
        id: randomUUID(),
        entityId,
        paymentId,
        settlementId,
        amount: Number(amount),
        currency: currency || 'USD',
        rail: 'LedgerRemittance',
        processorStatus: 'requires_review',
        verificationStatus: 'exception',
        verificationMethod: 'manual_override',
        executionReason: 'Selected ledger account is not approved for remittance execution.',
        executionReference: `SET-${Date.now()}`,
        sourceType,
        vendorInstructionVerified,
        simulatedProcessing: true,
        createdAt: new Date().toISOString(),
      };

      settlementExecutionJobs.unshift(execution);
      return res.status(201).json({ success: true, execution });
    }

    const policyDecision = decideRail({
      payee: {
        routingNumber,
        accountNumber,
        name: vendorInstruction?.beneficiaryName || vendorInstruction?.bankName || 'Vendor Payee',
      },
      amount: Number(amount),
      urgency:
        method === 'wire'
          ? 'final'
          : urgency === 'instant' || urgency === 'same_day' || urgency === 'standard' || urgency === 'final'
            ? urgency
            : 'standard',
      risk: {
        signalDecision: null,
      },
      userPreference:
        method === 'wire'
          ? 'Fedwire'
          : vendorInstruction?.railPreference === 'wire'
            ? 'Fedwire'
            : vendorInstruction?.railPreference === 'eft'
              ? 'SameDayACH'
              : urgency === 'same_day'
                ? 'SameDayACH'
                : undefined,
    });

    rail = sourceType === 'ledger_account' && policyDecision.rail !== 'None'
      ? 'LedgerRemittance'
      : policyDecision.rail;
    executionReason =
      sourceType === 'ledger_account'
        ? `Ledger remittance proxy selected. ${policyDecision.reason}`
        : policyDecision.reason;
    processorStatus = rail === 'None' ? 'blocked' : 'processing';
    verificationStatus = 'pending';
    verificationMethod =
      sourceType === 'ledger_account' ? 'internal_control_token' : 'bank_confirmation';
  } else if (direction === 'outgoing' && (method === 'ach' || method === 'wire')) {
    rail = method === 'wire' ? 'Fedwire' : 'StandardACH';
    executionReason = 'Vendor bank instructions are incomplete or invalid.';
    processorStatus = 'requires_review';
    verificationStatus = 'exception';
    verificationMethod = 'manual_override';
  } else if (direction === 'incoming') {
    rail = method === 'wire' ? 'Fedwire' : method === 'ach' ? 'StandardACH' : 'None';
    executionReason = 'Incoming settlement recorded for verification and remittance tracking.';
    processorStatus = rail === 'None' ? 'queued' : 'processing';
    verificationStatus = 'pending';
    verificationMethod = 'bank_confirmation';
  }

  if (
    sourceType === 'bank_account' &&
    method === 'ach' &&
    sourceBankAccount &&
    sourceBankAccount.achOriginationEnabled === false
  ) {
    processorStatus = 'requires_review';
    executionReason = 'Source bank account is present but ACH origination is not enabled.';
  }

  if (
    sourceType === 'bank_account' &&
    method === 'wire' &&
    sourceBankAccount &&
    sourceBankAccount.wireEnabled === false
  ) {
    processorStatus = 'requires_review';
    executionReason = 'Source bank account is present but wire origination is not enabled.';
  }

  const execution = {
    id: randomUUID(),
    entityId,
    paymentId,
    settlementId,
    amount: Number(amount),
    currency: currency || 'USD',
    rail,
    processorStatus,
    verificationStatus,
    verificationMethod,
    executionReason,
    executionReference: `SET-${Date.now()}`,
    sourceType,
    vendorInstructionVerified,
    simulatedProcessing: true,
    createdAt: new Date().toISOString(),
  };

  settlementExecutionJobs.unshift(execution);
  return res.status(201).json({ success: true, execution });
});

router.post('/reconciliations/:reconciliationId/statement-import', (req, res) => {
  const { reconciliationId } = req.params;
  const { bankAccountId, statementEndingBalance, statementFileName, exceptionNotes } = req.body || {};

  if (!reconciliationId || !bankAccountId) {
    return res.status(400).json({ success: false, error: 'Missing statement import payload.' });
  }

  const importJob = {
    id: randomUUID(),
    reconciliationId,
    bankAccountId,
    statementEndingBalance: Number(statementEndingBalance || 0),
    statementFileName: statementFileName || null,
    exceptionNotes: exceptionNotes || null,
    status: 'processed',
    importedAt: new Date().toISOString(),
  };

  statementImportJobs.unshift(importJob);
  return res.status(201).json({ success: true, importJob });
});

router.post('/reconciliations/:reconciliationId/close', (req, res) => {
  const { reconciliationId } = req.params;
  const { closeSummary, exceptionNotes } = req.body || {};

  if (!reconciliationId) {
    return res.status(400).json({ success: false, error: 'Missing reconciliation id.' });
  }

  const closeJob = {
    id: randomUUID(),
    reconciliationId,
    closeSummary: closeSummary || null,
    exceptionNotes: exceptionNotes || null,
    status: 'processed',
    closedAt: new Date().toISOString(),
  };

  reconciliationCloseJobs.unshift(closeJob);
  return res.status(201).json({ success: true, closeJob });
});

router.get('/ops-status', (_req, res) => {
  return res.status(200).json({
    success: true,
    counts: {
      invoiceDeliveries: invoiceDeliveryJobs.length,
      invoiceExports: invoiceExportJobs.length,
      statementImports: statementImportJobs.length,
      reconciliationCloses: reconciliationCloseJobs.length,
      settlementExecutions: settlementExecutionJobs.length,
    },
  });
});

export default router;
