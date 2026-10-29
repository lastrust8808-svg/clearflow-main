import { getApiBaseUrl } from './runtimeConfig.service';

type OperationStatus = 'queued' | 'processed' | 'sent' | 'fallback_required';

interface DeliveryQueueResponse {
  success: boolean;
  job: {
    id: string;
    status: OperationStatus;
    queuedAt: string;
    persistedAt: string;
    persistence: 'durable';
    operation: 'send' | 'export';
    sentAt?: string;
    deliveryChannel?: 'smtp' | 'manual' | 'internal';
    fallbackReason?: string | null;
  };
}

interface StatementImportResponse {
  success: boolean;
  importJob: {
    id: string;
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

function isAcceptedJob(value: unknown, key: 'job' | 'importJob' | 'closeJob', operation?: 'send' | 'export'): boolean {
  if (!isRecord(value) || value.success !== true || !isRecord(value[key])) return false;
  const job = value[key];
  if (typeof job.id !== 'string' || job.id.trim() === '') return false;
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
    (result) => isAcceptedJob(result, 'job', 'send'));
}

export async function queueInvoiceExport(payload: {
  invoiceId: string;
  entityId: string;
  invoiceNumber: string;
}) {
  return postErp<DeliveryQueueResponse>('/api/erp/invoice-exports', payload, 'Invoice export',
    (result) => isAcceptedJob(result, 'job', 'export'));
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
    payload, 'Statement import', (result) => isAcceptedJob(result, 'importJob'));
}

export async function closeReconciliationJob(payload: {
  reconciliationId: string;
  closeSummary: string;
  exceptionNotes?: string;
}) {
  return postErp<ReconciliationCloseResponse>(
    `/api/erp/reconciliations/${encodeURIComponent(payload.reconciliationId)}/close`,
    payload, 'Reconciliation close', (result) => isAcceptedJob(result, 'closeJob'));
}
