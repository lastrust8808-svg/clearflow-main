import express from 'express';
import { randomUUID } from 'node:crypto';

const router = express.Router();

const invoiceDeliveryJobs = [];
const invoiceExportJobs = [];
const statementImportJobs = [];
const reconciliationCloseJobs = [];

router.post('/invoice-deliveries', (req, res) => {
  const { invoiceId, entityId, invoiceNumber, deliveryMethod, recipientEmail, internalDeliveryTarget } =
    req.body || {};

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
    },
  });
});

export default router;
