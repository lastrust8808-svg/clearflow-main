import { getApiBaseUrl } from './runtimeConfig.service';

type OperationStatus = 'queued' | 'processed' | 'sent' | 'fallback_required';

interface DeliveryQueueResponse {
  success: boolean;
  job: {
    id: string;
    invoiceId: string;
    entityId: string;
    status: OperationStatus;
    queuedAt: string;
    persistedAt: string;
    persistence: 'durable';
    operation: 'send' | 'export';
    sentAt?: string;
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
  return Number.isFinite(timestamp) &&
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
  if (typeof job.id !== 'string' || job.id.trim() === '') return false;
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
      (job.deliveryChannel === 'smtp' || job.deliveryChannel === 'internal');
  }
  // Imports and accounting-period closure require the same durable receipt as
  // invoice jobs. A process-local "processed" status is never sufficient.
  const expectedOperation = key === 'importJob' ? 'statement_import' : 'reconciliation_close';
  const completedAt = key === 'importJob' ? job.importedAt : job.closedAt;
  return job.operation === expectedOperation && job.status === 'processed' &&
    hasDurableReceipt(job) && isUtcTimestamp(job.persistedAt) &&
    isUtcTimestamp(completedAt) &&
    Date.parse(completedAt) >= Date.parse(job.persistedAt);
}

// The Accounting UI treats a successful internal delivery acknowledgement as
// "sent", and treats an email acknowledgement as a completed SMTP send. Never
// allow a merely queued response (or a response for another destination) to
// cross that UI boundary. The generic job validator still covers non-delivery
// operations and legacy callers that do not request a delivery channel.
function isConfirmedInvoiceDelivery(
  value: unknown,
  payload: { invoiceId: string; entityId: string; deliveryMethod?: string; recipientEmail?: string; internalDeliveryTarget?: string },
): boolean {
  if (!isAcceptedJob(value, 'job', 'send', { invoiceId: payload.invoiceId, entityId: payload.entityId })) return false;
  if (payload.deliveryMethod !== 'email' && payload.deliveryMethod !== 'internal_user') return true;
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
  const response = await fetch(`${ERP_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${label} was not accepted by the server (HTTP ${response.status}). Please retry.`);
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
    (result) => isAcceptedJob(result, 'job', 'export', { invoiceId: payload.invoiceId, entityId: payload.entityId }));
}

export async function importReconciliationStatement(payload: {
  reconciliationId: string;
  bankAccountId: string;
  statementEndingBalance: number;
  statementFileName: string;
  exceptionNotes: string;
}) {
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
