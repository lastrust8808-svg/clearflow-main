import type {
  CoreDataBundle,
  EntityRecord,
  InvoiceRecord,
  SettlementPath,
  WorkspaceSettingsRecord,
} from '../../types/core';
import type { AccountingStats, JournalDraft } from './accountingTypes';

export const subnavItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'bills', label: 'Bills' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'customers', label: 'Customers' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'payments', label: 'Payments' },
  { id: 'intercompany', label: 'Intercompany' },
  { id: 'reconciliation', label: 'Reconciliation' },
] as const;

export const buildAutoNumber = (prefix: string, startingNumber: string) => {
  const base = Number(startingNumber || 1000);
  const next = Number.isFinite(base) ? base : 1000;
  return `${prefix}-${next}`;
};

export const getPrimaryEntity = (data: CoreDataBundle) => data.entities[0];

export const getEntityNumberingPrefix = (
  entity: EntityRecord | undefined,
  type: 'invoice' | 'quote' | 'bill' | 'receipt' | 'journal',
) => {
  if (!entity?.numbering) {
    return {
      invoice: 'INV',
      quote: 'QUOTE',
      bill: 'BILL',
      receipt: 'RCPT',
      journal: 'JE',
    }[type];
  }

  return {
    invoice: entity.numbering.invoicePrefix,
    quote: entity.numbering.quotePrefix,
    bill: entity.numbering.billPrefix,
    receipt: entity.numbering.receiptPrefix,
    journal: entity.numbering.journalPrefix,
  }[type];
};

export const getEntityNextSequence = (
  entity: EntityRecord | undefined,
  type: 'invoice' | 'quote' | 'bill' | 'receipt' | 'journal',
) => {
  if (!entity?.numbering) {
    return 1000;
  }

  return {
    invoice: entity.numbering.nextInvoiceSequence,
    quote: entity.numbering.nextQuoteSequence,
    bill: entity.numbering.nextBillSequence,
    receipt: entity.numbering.nextReceiptSequence,
    journal: entity.numbering.nextJournalSequence,
  }[type];
};

export const incrementEntitySequence = (
  entity: EntityRecord,
  type: 'invoice' | 'quote' | 'bill' | 'receipt' | 'journal',
) => ({
  ...entity,
  numbering: entity.numbering
    ? {
        ...entity.numbering,
        nextInvoiceSequence:
          type === 'invoice'
            ? entity.numbering.nextInvoiceSequence + 1
            : entity.numbering.nextInvoiceSequence,
        nextQuoteSequence:
          type === 'quote'
            ? entity.numbering.nextQuoteSequence + 1
            : entity.numbering.nextQuoteSequence,
        nextBillSequence:
          type === 'bill' ? entity.numbering.nextBillSequence + 1 : entity.numbering.nextBillSequence,
        nextReceiptSequence:
          type === 'receipt'
            ? entity.numbering.nextReceiptSequence + 1
            : entity.numbering.nextReceiptSequence,
        nextJournalSequence:
          type === 'journal'
            ? entity.numbering.nextJournalSequence + 1
            : entity.numbering.nextJournalSequence,
      }
    : undefined,
});

export const buildEntityScopedNumber = (
  entity: EntityRecord | undefined,
  type: 'invoice' | 'quote' | 'bill' | 'receipt' | 'journal',
  manualNumber: string,
  startingNumber: string,
) => {
  if (manualNumber.trim()) {
    return manualNumber.trim();
  }

  const prefix = getEntityNumberingPrefix(entity, type);
  const suggestedSequence = getEntityNextSequence(entity, type);
  return buildAutoNumber(prefix, startingNumber || String(suggestedSequence));
};

export const getEntitySettlementDefault = (
  entity: EntityRecord | undefined,
  workspaceSettings: WorkspaceSettingsRecord,
): SettlementPath =>
  entity?.operationalDefaults?.defaultSettlementPath ??
  workspaceSettings.defaultSettlementPath;

export const shouldAutoIssueTokens = (
  entity: EntityRecord | undefined,
  workspaceSettings: WorkspaceSettingsRecord,
) =>
  entity?.operationalDefaults?.autoIssueVerificationTokens ??
  workspaceSettings.autoIssueVerificationTokens;

export const isQuoteRecord = (record: InvoiceRecord) =>
  String(record.invoiceNumber ?? '').startsWith('QUOTE-');

export const formatCurrency = (amount: number | undefined, currency = 'USD') =>
  `${currency} ${Number(amount ?? 0).toLocaleString()}`;

export const buildAccountingStats = (
  data: CoreDataBundle,
  journalDrafts: JournalDraft[],
): AccountingStats => {
  const invoices = data.invoices ?? [];
  const bills = data.bills ?? [];
  const expenses = data.expenses ?? [];
  const receipts = data.receipts ?? [];
  const payments = data.payments ?? [];

  const openInvoices = invoices.filter(
    (record) => !isQuoteRecord(record) && (record.balanceDue ?? 0) > 0,
  );
  const openBills = bills.filter((record) => (record.balanceDue ?? 0) > 0);
  const totalMonthlyIn = invoices
    .filter((record) => !isQuoteRecord(record))
    .reduce((sum, record) => sum + Number(record.totalAmount ?? 0), 0);
  const totalMonthlyOut =
    bills.reduce((sum, record) => sum + Number(record.totalAmount ?? 0), 0) +
    expenses.reduce((sum, record) => sum + Number(record.amount ?? 0), 0);
  const upcomingPayments = payments.filter((record) => record.status !== 'settled').length;

  return {
    openInvoiceCount: openInvoices.length,
    openInvoiceAmount: openInvoices.reduce(
      (sum, record) => sum + Number(record.balanceDue ?? 0),
      0,
    ),
    openBillCount: openBills.length,
    openBillAmount: openBills.reduce(
      (sum, record) => sum + Number(record.balanceDue ?? 0),
      0,
    ),
    totalMonthlyIn,
    totalMonthlyOut,
    upcomingPayments,
    receiptCount: receipts.length,
    journalCount: journalDrafts.length,
  };
};

export const updateCollectionRecord = <T extends { id: string }>(
  collection: T[] | undefined,
  nextRecord: T,
) => (collection ?? []).map((record) => (record.id === nextRecord.id ? nextRecord : record));

export const buildVaultPath = (
  entityId: string,
  folder: 'bills' | 'receipts' | 'documents',
  fileName: string,
) => `/vault/${entityId}/${folder}/${fileName.replace(/\s+/g, '-').toLowerCase()}`;
