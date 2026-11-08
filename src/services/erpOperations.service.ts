import { getApiBaseUrl } from './runtimeConfig.service';

type OperationStatus = 'queued' | 'processed' | 'sent' | 'fallback_required';

interface DeliveryQueueResponse {
  success: boolean;
  job: {
    id: string;
    invoiceId: string;
    entityId: string;
    invoiceNumber: string;
    status: OperationStatus;
    queuedAt: string;
    persistedAt: string;
    persistence: 'durable';
    operation: 'send' | 'export';
    sentAt?: string;
    // Transport-specific acknowledgement, issued after actual delivery.
    deliveryReceiptId?: string;
    deliveryChannel?: 'smtp' | 'manual' | 'internal';
    recipientEmail?: string;
    internalDeliveryTarget?: string;
    fallbackReason?: string | null;
  };
}

interface StatementImportResponse {
  success: boolean;
  importJob: {
    id: string;
    reconciliationId: string;
    bankAccountId: string;
    status: 'processed';
    operation: 'statement_import';
    queuedAt: string;
    persistedAt: string;
    persistence: 'durable';
    importedAt: string;
    // Separate, durably persisted completion evidence; job reservation alone is not posting.
    completionReceiptId: string;
    completionPersistedAt: string;
  };
}

interface ReconciliationCloseResponse {
  success: boolean;
  closeJob: {
    id: string;
    reconciliationId: string;
    status: 'processed';
    operation: 'reconciliation_close';
    queuedAt: string;
    persistedAt: string;
    persistence: 'durable';
    closedAt: string;
    completionReceiptId: string;
    completionPersistedAt: string;
  };
}

const ERP_API_BASE = getApiBaseUrl();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A queued acknowledgement is not proof of durable acceptance unless the
// authenticated backend supplies an explicit persistence receipt. This is
// response validation, not a substitute for server-side transactional storage.
function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  // A receipt dated in the future is not proof that a job has already been
  // durably accepted, sent, imported, or closed. Allow five minutes of clock
  // skew between the browser and the authenticated backend.
  return Number.isFinite(timestamp) &&
    timestamp <= Date.now() + 5 * 60 * 1000 &&
    new Date(timestamp).toISOString().slice(0, 19) === value.slice(0, 19);
}

function hasDurableReceipt(job: Record<string, unknown>): boolean {
  return job.persistence === 'durable' &&
    isUtcTimestamp(job.queuedAt) &&
    isUtcTimestamp(job.persistedAt) &&
    Date.parse(job.persistedAt) >= Date.parse(job.queuedAt);
}

function isAcceptedJob(
  value: unknown,
  key: 'job' | 'importJob' | 'closeJob',
  operation: 'send' | 'export' | undefined,
  expectedIds: Record<string, string>,
): boolean {
  if (!isRecord(value) || value.success !== true || !isRecord(value[key])) return false;
  const job = value[key];
  // The PostgreSQL reservation store returns canonical UUIDs, never synthetic
  // in-memory job IDs. A nonempty arbitrary string is not durable evidence.
  if (typeof job.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(job.id)) return false;
  // An acknowledgement for another invoice, entity, bank account, or
  // reconciliation is not evidence that this request was durably accepted.
  // Require the server to echo immutable request identities; never infer them
  // from an HTTP 2xx status or a plausible-looking job identifier.
  if (!Object.entries(expectedIds).every(([field, id]) =>
    typeof id === 'string' && id.trim() !== '' && job[field] === id)) return false;
  if (operation) {
    if (job.operation !== operation || !hasDurableReceipt(job)) return false;
    // A manual fallback is not accepted delivery or export. An explicit sent
    // acknowledgement must carry completion metadata; export cannot be "sent".
    if (job.status === 'queued') return true;
    return operation === 'send' && job.status === 'sent' &&
      isUtcTimestamp(job.sentAt) && isUtcTimestamp(job.persistedAt) &&
      Date.parse(job.sentAt) >= Date.parse(job.persistedAt) &&
      // A timestamp and destination alone are not transport evidence.
      // The backend must persist the provider/internal delivery receipt ID.
      typeof job.deliveryReceiptId === 'string' &&
      job.deliveryReceiptId.trim().length > 0 &&
      job.deliveryReceiptId.length <= 255 &&
      // Reject control/invisible characters that can disguise a synthetic
      // transport receipt or corrupt an audit trail.
      !/[\p{Cc}\p{Cf}]/u.test(job.deliveryReceiptId) &&
      (job.deliveryChannel === 'smtp' || job.deliveryChannel === 'internal');
  }
  // Imports and accounting-period closure require the same durable receipt as
  // invoice jobs. A process-local "processed" status is never sufficient.
  const expectedOperation = key === 'importJob' ? 'statement_import' : 'reconciliation_close';
  const completedAt = key === 'importJob' ? job.importedAt : job.closedAt;
  // A reservation timestamp is not evidence that statement rows were posted
  // or a reconciliation was durably closed. Require a separate persisted
  // completion receipt with a canonical database identity and chronology.
  // The authenticated backend must verify the actual ledger/audit transaction.
  const completionId = job.completionReceiptId;
  return job.operation === expectedOperation && job.status === 'processed' &&
    hasDurableReceipt(job) && isUtcTimestamp(job.persistedAt) &&
    isUtcTimestamp(completedAt) &&
    typeof completionId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(completionId) &&
    completionId !== job.id &&
    isUtcTimestamp(job.completionPersistedAt) &&
    Date.parse(completedAt) >= Date.parse(job.persistedAt) &&
    Date.parse(job.completionPersistedAt) >= Date.parse(completedAt);
}

// The Accounting UI treats a successful internal delivery acknowledgement as
// "sent", and treats an email acknowledgement as a completed SMTP send. Never
// allow a merely queued response (or a response for another destination) to
// cross that UI boundary. The generic job validator still covers non-delivery
// operations and legacy callers that do not request a delivery channel.
function isConfirmedInvoiceDelivery(
  value: unknown,
  payload: { invoiceId: string; entityId: string; invoiceNumber: string; deliveryMethod?: string; recipientEmail?: string; internalDeliveryTarget?: string },
): boolean {
  if (!isAcceptedJob(value, 'job', 'send', { invoiceId: payload.invoiceId, entityId: payload.entityId, invoiceNumber: payload.invoiceNumber })) return false;
  // Delivery is never confirmed by a generic queued receipt or an unspecified
  // destination. The UI may mark this operation "sent", so require a declared
  // delivery method and actual completed transport evidence for every caller.
  if (payload.deliveryMethod !== 'email' && payload.deliveryMethod !== 'internal_user') return false;
  if (!isRecord(value) || !isRecord(value.job) || value.job.status !== 'sent') return false;
  if (payload.deliveryMethod === 'email') {
    return value.job.deliveryChannel === 'smtp' &&
      typeof payload.recipientEmail === 'string' && payload.recipientEmail.trim() !== '' &&
      value.job.recipientEmail === payload.recipientEmail;
  }
  return value.job.deliveryChannel === 'internal' &&
    typeof payload.internalDeliveryTarget === 'string' && payload.internalDeliveryTarget.trim() !== '' &&
    value.job.internalDeliveryTarget === payload.internalDeliveryTarget;
}

async function postErp<T>(path: string, payload: unknown, label: string, validate: (value: unknown) => boolean): Promise<T> {
  // Never fabricate a successful job. The caller must retain the user's input for retry.
  let response: Response;
  try {
    response = await fetch(`${ERP_API_BASE}${path}`, {
      method: 'POST',
      // Financial acknowledgements must come from the network, never a cached
      // success from a service worker or intermediary after a failed retry.
      cache: 'no-store',
      // Never replay a financial POST to a redirected destination. A redirect
      // may conceal a changed tenant/API endpoint or an uncertain first write.
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(payload),
    });
  } catch {
    // A connection may fail after the server has already committed the job.
    // Without a persisted idempotency key and status lookup, blind retry can
    // duplicate invoice delivery, statement imports or accounting closure.
    throw new Error(`${label} outcome unknown: no server confirmation was received. Verify operation status before retrying.`);
  }
  // A custom fetch adapter or service worker may follow a redirect despite
  // redirect: 'error'. A final HTTP 200 is not evidence that the original
  // financial endpoint accepted the operation; require status reconciliation.
  // Even with redirected=false, a custom adapter may return a receipt from
  // another origin or endpoint. A financial acknowledgement must be bound to
  // the exact requested URL; a missing URL is tolerated only for legacy test
  // adapters, not for native Fetch responses.
  const expectedUrl = new URL(`${ERP_API_BASE}${path}`, globalThis.location?.href || 'https://localhost').href;
  if (typeof response.url === 'string' && response.url !== '' && response.url !== expectedUrl) {
    throw new Error(`${label} outcome unknown: mismatched financial response URL. Verify operation status before retrying.`);
  }
  if (response.redirected === true) {
    throw new Error(`${label} outcome unknown: redirected financial response. Verify operation status before retrying.`);
  }
  // Opaque and error fetch results cannot establish HTTP acceptance or response origin.
  // Custom adapters may expose an apparently successful status alongside an
  // opaque response type; neither is evidence of a committed ERP operation.
  if (response.type === 'opaque' || response.type === 'opaqueredirect' || response.type === 'error') {
    throw new Error(`${label} outcome unknown: opaque financial response. Verify operation status before retrying.`);
  }
  if (!response.ok) {
    // The ERP backend explicitly fails closed with this exact 503 contract
    // BEFORE accepting a job. Distinguish that confirmed no-op from a generic
    // 503 that might follow a committed operation. Never infer rejection from
    // HTTP status alone; require the matching operation-specific response.
    if (response.status === 503) {
      const expectedOperation: Record<string, string> = {
        'Invoice delivery': 'invoice_delivery',
        'Invoice export': 'invoice_export',
        'Statement import': 'statement_import',
        'Reconciliation close': 'reconciliation_close',
      };
      let failure: unknown;
      try {
        failure = await response.json();
      } catch {
        // Malformed or missing failure evidence remains an unknown outcome.
      }
      if (isRecord(failure) &&
          failure.success === false &&
          failure.code === 'ERP_DURABLE_JOB_STORE_REQUIRED' &&
          failure.operation === expectedOperation[label] &&
          !Object.hasOwn(failure, 'job') &&
          !Object.hasOwn(failure, 'importJob') &&
          !Object.hasOwn(failure, 'closeJob') &&
          // A durable-store refusal must match the exact fail-closed route
          // contract. Unexpected receipt/approval fields make the outcome
          // ambiguous rather than proving that nothing was committed.
          Object.keys(failure).length === 4 &&
          typeof failure.error === 'string' &&
          failure.error === 'This operation is unavailable until authenticated durable job storage is implemented. No job was queued and no message was sent.') {
        throw new Error(`${label} is unavailable: durable job storage is not enabled. No operation was queued or completed.`);
      }
    }
    // A 5xx, timeout, conflict, Too Early (425), or throttled response may follow a committed operation.
    // Only an explicit non-transient client rejection can be treated as
    // rejected rather than indeterminate.
    // A 3xx response (including an opaque/manual redirect) cannot prove the
    // original endpoint did not accept the write. Never classify it as a safe
    // rejection even if a custom fetch adapter exposes the redirect response.
    if ((response.status >= 300 && response.status < 400) || response.status === 0 || response.status >= 500 || response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429) {
      throw new Error(`${label} outcome unknown (HTTP ${response.status}). Verify operation status before retrying.`);
    }
    throw new Error(`${label} was rejected by the server (HTTP ${response.status}). Resolve the error before retrying.`);
  }
  // A partial/multi-status HTTP success is not a complete financial-operation
  // acknowledgement, even if a proxy includes a plausible receipt body.
  // Only ordinary full-response success codes can cross the accounting UI boundary.
  if (![200, 201, 202].includes(response.status)) {
    // 203 is proxy-transformed, 204/205 have no receipt body, and 206/207,
    // 208/226 cannot establish an unmodified, complete operation receipt.
    // Even a custom fetch adapter's plausible JSON must not override status.
    throw new Error(`${label} returned an unverified server acknowledgement (HTTP ${response.status}). Verify operation status before retrying.`);
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(`${label} returned an invalid server response. Please verify before retrying.`);
  }
  if (!validate(result)) {
    throw new Error(`${label} was not confirmed by the server. Please verify before retrying.`);
  }
  return result as T;
}

export async function queueInvoiceDelivery(payload: {
  invoiceId: string;
  entityId: string;
  invoiceNumber: string;
  deliveryMethod?: string;
  recipientEmail?: string;
  internalDeliveryTarget?: string;
  fromName?: string;
  emailSubject?: string;
  emailTextBody?: string;
  emailHtmlBody?: string;
  attachmentFileName?: string;
  attachmentHtml?: string;
  replyTo?: string;
}) {
  return postErp<DeliveryQueueResponse>('/api/erp/invoice-deliveries', payload, 'Invoice delivery',
    (result) => isConfirmedInvoiceDelivery(result, payload));
}

export async function queueInvoiceExport(payload: {
  invoiceId: string;
  entityId: string;
  invoiceNumber: string;
}) {
  return postErp<DeliveryQueueResponse>('/api/erp/invoice-exports', payload, 'Invoice export',
    (result) => isAcceptedJob(result, 'job', 'export', { invoiceId: payload.invoiceId, entityId: payload.entityId, invoiceNumber: payload.invoiceNumber }));
}

export async function importReconciliationStatement(payload: {
  reconciliationId: string;
  bankAccountId: string;
  statementEndingBalance: number;
  statementFileName: string;
  exceptionNotes: string;
}) {
  // JSON.stringify silently converts NaN/Infinity to null and -0 to zero.
  // Reject unrepresentable or fractional-cent statement balances before any
  // network request; never submit a different accounting amount than entered.
  const balance = payload.statementEndingBalance;
  const minorUnits = typeof balance === 'number' ? balance * 100 : NaN;
  const roundedCents = Math.round(minorUnits);
  // A tolerance around an integer cent silently admits sub-cent values
  // (e.g. 1.0000000001). Require an exact round-trip through integer cents
  // while accommodating ordinary binary floating-point representations.
  if (!Number.isFinite(balance) || Object.is(balance, -0) ||
      !Number.isSafeInteger(roundedCents) ||
      roundedCents / 100 !== balance) {
    throw new TypeError('Invalid statement ending balance: a finite, exact cent amount is required.');
  }
  return postErp<StatementImportResponse>(
    `/api/erp/reconciliations/${encodeURIComponent(payload.reconciliationId)}/statement-import`,
    payload, 'Statement import', (result) => isAcceptedJob(result, 'importJob', undefined,
      { reconciliationId: payload.reconciliationId, bankAccountId: payload.bankAccountId }));
}

export async function closeReconciliationJob(payload: {
  reconciliationId: string;
  closeSummary: string;
  exceptionNotes?: string;
}) {
  return postErp<ReconciliationCloseResponse>(
    `/api/erp/reconciliations/${encodeURIComponent(payload.reconciliationId)}/close`,
    payload, 'Reconciliation close', (result) => isAcceptedJob(result, 'closeJob', undefined,
      { reconciliationId: payload.reconciliationId }));
}
