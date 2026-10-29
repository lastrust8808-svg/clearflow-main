import express from 'express';
import { randomUUID } from 'node:crypto';
import { buildExecutionCapabilities } from '../services/paymentExecution.js';

const router = express.Router();

const statementImportJobs = [];

// Fail closed until a durable, tenant-authorized job store and delivery audit exist.
// In particular, never send SMTP before a job has been durably accepted.
function rejectNonDurableJob(res, operation) {
  return res.status(503).json({
    success: false,
    code: 'ERP_DURABLE_JOB_STORE_REQUIRED',
    operation,
    error: 'This operation is unavailable until authenticated durable job storage is implemented. No job was queued and no message was sent.',
  });
}

router.post('/invoice-deliveries', (req, res) => {
  const { invoiceId, entityId, invoiceNumber } = req.body || {};
  if (!invoiceId || !entityId || !invoiceNumber) {
    return res.status(400).json({ success: false, error: 'Missing invoice delivery payload.' });
  }
  return rejectNonDurableJob(res, 'invoice_delivery');
});

router.post('/invoice-exports', (req, res) => {
  const { invoiceId, entityId, invoiceNumber } = req.body || {};
  if (!invoiceId || !entityId || !invoiceNumber) {
    return res.status(400).json({ success: false, error: 'Missing invoice export payload.' });
  }
  return rejectNonDurableJob(res, 'invoice_export');
});

// Fail closed before contacting any provider: durable tenant-scoped idempotency,
// approval and audit persistence are not yet implemented for this endpoint.
router.post('/settlements/execute', (req, res) => {
  const { entityId, paymentId, settlementId, amount } = req.body || {};
  if (!entityId || !paymentId || !settlementId || !amount) {
    return res.status(400).json({ success: false, error: 'Missing settlement execution payload.' });
  }
  return rejectNonDurableJob(res, 'settlement_execution');
});

router.get('/settlements/execution-capabilities', (_req, res) => {
  return res.status(200).json({
    success: true,
    capabilities: buildExecutionCapabilities(),
  });
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

// Reconciliation closure must be committed transactionally with tenant-scoped
// approval, statement matching, idempotency and audit evidence. A process-local
// queue is not a closed accounting period; never acknowledge one as processed.
router.post('/reconciliations/:reconciliationId/close', (req, res) => {
  const { reconciliationId } = req.params;
  if (!reconciliationId) {
    return res.status(400).json({ success: false, error: 'Missing reconciliation id.' });
  }
  return rejectNonDurableJob(res, 'reconciliation_close');
});

router.get('/ops-status', (_req, res) => {
  return res.status(200).json({
    success: true,
    capabilities: {
      invoiceDeliveries: { available: false, reason: 'durable_job_store_required' },
      invoiceExports: { available: false, reason: 'durable_job_store_required' },
      settlementExecutions: { available: false, reason: 'durable_job_store_required' },
      reconciliationCloses: { available: false, reason: 'durable_job_store_required' },
    },
    counts: {
      invoiceDeliveries: 0,
      invoiceExports: 0,
      statementImports: statementImportJobs.length,
      reconciliationCloses: 0,
      settlementExecutions: 0,
    },
  });
});

export default router;
