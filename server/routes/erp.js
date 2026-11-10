import express from 'express';

const router = express.Router();

// Fail closed until a durable, tenant-authorized job store and delivery audit exist.
// In particular, never send SMTP before a job has been durably accepted.
function rejectNonDurableJob(res, operation) {
  // Never allow a proxy or browser to replay an unavailable response after
  // durable processing becomes available, or misrepresent current readiness.
  res.set('Cache-Control', 'no-store');
  return res.status(503).json({
    success: false,
    code: 'ERP_DURABLE_JOB_STORE_REQUIRED',
    operation,
    error: 'This operation is unavailable until authenticated durable job storage is implemented. No job was queued and no message was sent.',
  });
}

// Every ERP operation identifier must be an explicit, canonical identity.
// A truthy object, padded ID or invisible Unicode alias must not be treated
// as a valid future durable-job request or tenant/accounting audit key.
// Invalid financial-operation requests must not be cached by intermediaries.
function rejectInvalidErpPayload(res, error, code) {
  res.set('Cache-Control', 'no-store');
  return res.status(400).json({ success: false, ...(code ? { code } : {}), error });
}

function containsUnicodeNoncharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if ((codePoint >= 0xfdd0 && codePoint <= 0xfdef) ||
        (codePoint & 0xfffe) === 0xfffe) return true;
  }
  return false;
}

function validErpIdentifier(value) {
  return typeof value === 'string' && value.length <= 255 &&
    !containsUnicodeNoncharacter(value) &&
    Boolean(value.trim()) && value === value.trim() &&
    value === value.normalize('NFC') &&
    !/[\p{Cc}\p{Cf}\p{Cs}\p{Zs}\p{Zl}\p{Zp}]/u.test(value);
}

// Settlement amounts must survive exact-cent conversion before any future
// durable reservation or payment adapter can consume them. Reject coerced,
// non-finite, nonpositive and unsafe-precision monetary values.
function validSettlementAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return false;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && cents / 100 === value;
}

router.post('/invoice-deliveries', (req, res) => {
  const { invoiceId, entityId, invoiceNumber } = req.body || {};
  if (![invoiceId, entityId, invoiceNumber].every(validErpIdentifier)) {
    return rejectInvalidErpPayload(res, 'Missing invoice delivery payload.');
  }
  return rejectNonDurableJob(res, 'invoice_delivery');
});

router.post('/invoice-exports', (req, res) => {
  const { invoiceId, entityId, invoiceNumber } = req.body || {};
  if (![invoiceId, entityId, invoiceNumber].every(validErpIdentifier)) {
    return rejectInvalidErpPayload(res, 'Missing invoice export payload.');
  }
  return rejectNonDurableJob(res, 'invoice_export');
});

// Fail closed before contacting any provider: durable tenant-scoped idempotency,
// approval and audit persistence are not yet implemented for this endpoint.
router.post('/settlements/execute', (req, res) => {
  const { entityId, paymentId, settlementId, amount } = req.body || {};
  if (![entityId, paymentId, settlementId].every(validErpIdentifier) || !validSettlementAmount(amount)) {
    return rejectInvalidErpPayload(res, 'Missing settlement execution payload.');
  }
  return rejectNonDurableJob(res, 'settlement_execution');
});

// The provider configuration probe is not an execution-readiness signal.
// This route deliberately blocks ALL settlement execution until durable,
// tenant-authorized approval and audit persistence are integrated. Do not
// advertise ACH/wire/check as executable merely because a token is present.
router.get('/settlements/execution-capabilities', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  // No provider configuration is consulted: this endpoint is disabled regardless
  // of credentials, and a read-only capability response must not leak provider
  // configuration or fail because a provider adapter is unavailable.
  return res.status(200).json({
    success: true,
    capabilities: {
      provider: 'manual',
      executionMode: 'disabled',
      settlementExecutionAvailable: false,
      unavailableReason: 'durable_job_store_required',
      liveBankExecutionReady: false,
      mercuryApprovalReady: false,
      achOriginationReady: false,
      wireOriginationReady: false,
      billerDirectReady: false,
      printableCheckReady: false,
      positivePayReady: false,
      supportedMethods: [],
      notes: [
        'Settlement execution is disabled: authenticated durable job storage, approval and audit persistence are required. No payment request can be queued through this endpoint.',
      ],
    },
  });
});

router.post('/reconciliations/:reconciliationId/statement-import', (req, res) => {
  const { reconciliationId } = req.params;
  const { bankAccountId, statementEndingBalance } = req.body || {};

  // A body identity that disagrees with the route can reserve work against
  // the wrong reconciliation once durable execution is introduced.
  if (req.body && Object.hasOwn(req.body, 'reconciliationId') &&
      req.body.reconciliationId !== reconciliationId) {
    return rejectInvalidErpPayload(res, 'Statement reconciliation identity mismatch.', 'ERP_RECONCILIATION_ID_MISMATCH');
  }
  if (![reconciliationId, bankAccountId].every(validErpIdentifier)) {
    return rejectInvalidErpPayload(res, 'Missing statement import payload.');
  }
  // Independently enforce the same exact-cent contract as the ERP client.
  // JSON numbers may be fractional, overflowed or rounded before reaching
  // the handler. Never allow a future durable adapter to accept a different
  // accounting amount than the one represented by the request.
  const cents = typeof statementEndingBalance === 'number'
    ? Math.round(statementEndingBalance * 100) : NaN;
  if (!Number.isFinite(statementEndingBalance) ||
      Object.is(statementEndingBalance, -0) ||
      !Number.isSafeInteger(cents) ||
      cents / 100 !== statementEndingBalance) {
    return rejectInvalidErpPayload(res, 'Statement ending balance must be a finite exact-cent amount.', 'ERP_INVALID_STATEMENT_BALANCE');
  }

  // Import acceptance must persist the statement and evidence transactionally.
  // Do not acknowledge an import held only in process memory.
  return rejectNonDurableJob(res, 'statement_import');
});

// Reconciliation closure must be committed transactionally with tenant-scoped
// approval, statement matching, idempotency and audit evidence. A process-local
// queue is not a closed accounting period; never acknowledge one as processed.
router.post('/reconciliations/:reconciliationId/close', (req, res) => {
  const { reconciliationId } = req.params;
  if (!validErpIdentifier(reconciliationId)) {
    return rejectInvalidErpPayload(res, 'Missing reconciliation id.');
  }
  return rejectNonDurableJob(res, 'reconciliation_close');
});

router.get('/ops-status', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.status(200).json({
    success: true,
    capabilities: {
      invoiceDeliveries: { available: false, reason: 'durable_job_store_required' },
      invoiceExports: { available: false, reason: 'durable_job_store_required' },
      settlementExecutions: { available: false, reason: 'durable_job_store_required' },
      reconciliationCloses: { available: false, reason: 'durable_job_store_required' },
      statementImports: { available: false, reason: 'durable_job_store_required' },
    },
    // There is no authenticated durable count query yet. Zero would
    // incorrectly represent an unknown historical queue as empty and can
    // mislead operators into believing invoice work was never accepted.
    // Keep the existing count keys but mark each unavailable explicitly.
    countsAvailable: false,
    countsUnavailableReason: 'durable_job_store_required',
    counts: {
      invoiceDeliveries: null,
      invoiceExports: null,
      statementImports: null,
      reconciliationCloses: null,
      settlementExecutions: null,
    },
  });
});

export default router;
