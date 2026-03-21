import { useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle, DocumentRecord, InvoiceRecord, SettlementPath, TokenRecord } from '../../types/core';
import { analyzeAccountingUpload } from '../../services/accountingIntake.service';
import { saveDocumentFile } from '../../services/documentVault.service';
import {
  closeReconciliationJob,
  importReconciliationStatement,
  queueInvoiceDelivery,
  queueInvoiceExport,
} from '../../services/erpOperations.service';
import {
  buildInvoiceEmailPayload,
  buildInvoicePacketFileName,
  downloadInvoicePacket,
  openInvoiceEmailDraft,
  resolveInvoiceRecipientEmail,
} from '../../services/invoiceDelivery.service';
import { buildReconciliationCloseMetrics } from '../../services/reconciliationControls.service';
import { parseStatementFileForReconciliation } from '../../services/reconciliationStatement.service';
import AccountingDashboardSection from '../accounting/AccountingDashboardSection';
import AccountingToolbar from '../accounting/AccountingToolbar';
import BillIntakeModal from '../accounting/BillIntakeModal';
import CounterpartyModal from '../accounting/CounterpartyModal';
import EditableRecordSection from '../accounting/EditableRecordSection';
import InterEntityTransferModal from '../accounting/InterEntityTransferModal';
import InvoiceOperationsWorkspace from '../accounting/InvoiceOperationsWorkspace';
import InvoiceQuickAddModal from '../accounting/InvoiceQuickAddModal';
import JournalEntryModal from '../accounting/JournalEntryModal';
import PaymentRecordModal from '../accounting/PaymentRecordModal';
import QuoteBuilderModal from '../accounting/QuoteBuilderModal';
import ReconciliationWorkspace from '../accounting/ReconciliationWorkspace';
import ReceiptIntakeModal from '../accounting/ReceiptIntakeModal';
import type {
  AccountingSection,
  BillSubmitPayload,
  CounterpartySubmitPayload,
  InterEntityTransferSubmitPayload,
  InvoiceSubmitPayload,
  JournalSubmitPayload,
  PaymentSubmitPayload,
  QuoteSubmitPayload,
  ReceiptSubmitPayload,
} from '../accounting/accountingTypes';
import {
  buildAccountingStats,
  buildEntityScopedNumber,
  buildVaultPath,
  formatCurrency,
  getEntityNextSequence,
  getEntitySettlementDefault,
  getPrimaryEntity,
  incrementEntitySequence,
  isQuoteRecord,
  shouldAutoIssueTokens,
  subnavItems,
  updateCollectionRecord,
} from '../accounting/accountingUtils';
import PageSection from '../ui/PageSection';

interface AccountingPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

const shellStyle: CSSProperties = {
  display: 'grid',
  gap: 20,
};

const sectionButtonStyle = (isActive: boolean): CSSProperties => ({
  padding: '10px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: isActive ? '1px solid #60a5fa' : '1px solid rgba(148,163,184,0.25)',
  background: isActive ? 'rgba(37,99,235,0.22)' : 'rgba(15,23,42,0.4)',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontWeight: isActive ? 700 : 500,
});

export default function AccountingPage({ data, setData }: AccountingPageProps) {
  const [activeSubsection, setActiveSubsection] =
    useState<AccountingSection>('dashboard');
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isIntercompanyModalOpen, setIsIntercompanyModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [counterpartyModalMode, setCounterpartyModalMode] =
    useState<'customer' | 'vendor' | null>(null);

  const invoices = data.invoices ?? [];
  const bills = data.bills ?? [];
  const expenses = data.expenses ?? [];
  const receipts = data.receipts ?? [];
  const customers = data.customers ?? [];
  const vendors = data.vendors ?? [];
  const payments = data.payments ?? [];
  const journalEntries = data.journalEntries ?? [];
  const interEntityTransfers = data.interEntityTransfers ?? [];
  const bankAccounts = data.bankAccounts ?? [];
  const reconciliations = data.reconciliations ?? [];

  const quoteRecords = invoices.filter(isQuoteRecord);
  const standardInvoices = invoices.filter((record) => !isQuoteRecord(record));
  const stats = useMemo(() => buildAccountingStats(data, journalEntries), [data, journalEntries]);
  const defaultEntity = getPrimaryEntity(data);

  const mapSettlementPathToPaymentRail = (
    path: SettlementPath,
  ): 'ach' | 'wire' | 'card' | 'digital_asset' | 'manual' => {
    switch (path) {
      case 'wire':
        return 'wire';
      case 'card':
        return 'card';
      case 'wallet':
      case 'tokenized_credit':
      case 'tokenized_debit':
        return 'digital_asset';
      default:
        return 'ach';
    }
  };

  const resolveIssueDate = (value?: string) => value || new Date().toISOString().slice(0, 10);

  const resolveDueDate = (issueDate: string, paymentTerms: string, explicitDueDate?: string) => {
    if (explicitDueDate) {
      return explicitDueDate;
    }

    const baseDate = new Date(issueDate);
    const offsets: Record<string, number> = {
      due_on_receipt: 0,
      net_7: 7,
      net_15: 15,
      net_30: 30,
      net_45: 45,
      net_60: 60,
    };
    const offset = offsets[paymentTerms] ?? 30;
    baseDate.setDate(baseDate.getDate() + offset);
    return baseDate.toISOString().slice(0, 10);
  };

  const buildVerificationToken = ({
    entityId,
    subjectId,
    label,
    tokenReference,
    notes,
  }: {
    entityId: string;
    subjectId: string;
    label: string;
    tokenReference: string;
    notes: string;
  }): TokenRecord => ({
    id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityId,
    subjectType: 'document',
    subjectId,
    label,
    status: 'issued',
    tokenStandard: 'internal-proof',
    tokenReference,
    issuedAt: new Date().toISOString(),
    proofReference: 'Issued automatically from ERP document generation defaults.',
    notes,
  });

  const buildErpDocument = ({
    entityId,
    title,
    date,
    summary,
    linkedTokenIds,
    sourceRecordId,
  }: {
    entityId: string;
    title: string;
    date: string;
    summary: string;
    linkedTokenIds?: string[];
    sourceRecordId: string;
  }): DocumentRecord => ({
    id: `doc-${sourceRecordId}`,
    entityId,
    title,
    category: 'financial',
    date,
    status: 'final',
    sourceRecordType: 'document',
    sourceRecordId,
    linkedTokenIds,
    summary,
  });

  const buildInvoiceBrandingSnapshot = (
    baseEntity = defaultEntity,
    overrides?: { themeColor?: string; logoName?: string; footerNote?: string; headerStyle?: string },
  ): InvoiceRecord['brandingSnapshot'] => ({
    accentColor: overrides?.themeColor || baseEntity?.branding?.accentColor || data.workspaceSettings.preferredAccentColor,
    logoText: overrides?.logoName || baseEntity?.branding?.documentLogoText || baseEntity?.displayName || baseEntity?.name,
    footerNote:
      overrides?.footerNote ||
      baseEntity?.branding?.invoiceFooterNote ||
      'Generated through ClearFlow ERP controls.',
    headerStyle: overrides?.headerStyle || 'entity_standard',
  });

  const ensureCustomerRecord = (
    prev: CoreDataBundle,
    entityId: string,
    payload: { name?: string; email?: string; phone?: string; address?: string; notes?: string },
  ) => {
    const normalizedName = payload.name?.trim();
    if (!normalizedName) {
      return {
        customerId: prev.customers[0]?.id || `cust-${Date.now()}`,
        customers: prev.customers,
      };
    }

    const existingCustomer = prev.customers.find(
      (record) =>
        record.entityId === entityId && record.name.toLowerCase() === normalizedName.toLowerCase()
    );

    if (existingCustomer) {
      return {
        customerId: existingCustomer.id,
        customers: prev.customers.map((record) =>
          record.id === existingCustomer.id
            ? {
                ...record,
                email: payload.email || record.email,
                phone: payload.phone || record.phone,
                billingAddress: payload.address || record.billingAddress,
                notes: payload.notes || record.notes,
              }
            : record
        ),
      };
    }

    const customerId = `cust-${Date.now()}`;
    return {
      customerId,
      customers: [
        {
          id: customerId,
          entityId,
          name: normalizedName,
          email: payload.email || undefined,
          phone: payload.phone || undefined,
          billingAddress: payload.address || undefined,
          status: 'active' as const,
          notes: payload.notes || undefined,
        },
        ...prev.customers,
      ],
    };
  };

  const ensureVendorRecord = (
    prev: CoreDataBundle,
    entityId: string,
    payload: { name?: string; email?: string; phone?: string; address?: string; notes?: string },
  ) => {
    const normalizedName = payload.name?.trim();
    if (!normalizedName) {
      return {
        vendorId: prev.vendors[0]?.id || `ven-${Date.now()}`,
        vendors: prev.vendors,
      };
    }

    const existingVendor = prev.vendors.find(
      (record) =>
        record.entityId === entityId && record.name.toLowerCase() === normalizedName.toLowerCase()
    );

    if (existingVendor) {
      return {
        vendorId: existingVendor.id,
        vendors: prev.vendors,
      };
    }

    const vendorId = `ven-${Date.now()}`;
    return {
      vendorId,
      vendors: [
        {
          id: vendorId,
          entityId,
          name: normalizedName,
          email: payload.email || undefined,
          phone: payload.phone || undefined,
          remitAddress: payload.address || undefined,
          status: 'active' as const,
          notes: payload.notes || undefined,
        },
        ...prev.vendors,
      ],
    };
  };

  const persistUploadDocument = async ({
    entityId,
    folder,
    title,
    summary,
    sourceRecordType,
    sourceRecordId,
    file,
    date,
  }: {
    entityId: string;
    folder: 'bills' | 'receipts' | 'documents';
    title: string;
    summary: string;
    sourceRecordType: 'bill' | 'receipt' | 'document' | 'reconciliation';
    sourceRecordId: string;
    file?: File | null;
    date: string;
  }) => {
    if (!file) {
      return null;
    }

    try {
      const sourceFileId = `vault-${sourceRecordType}-${Date.now()}`;
      const fileMetadata = await saveDocumentFile(sourceFileId, file);

      const nextDocument: DocumentRecord = {
        id: `doc-${sourceRecordType}-${Date.now()}`,
        entityId,
        title,
        category: 'financial',
        date,
        status: 'final',
        fileName: fileMetadata.fileName,
        mimeType: fileMetadata.mimeType,
        sizeBytes: fileMetadata.sizeBytes,
        uploadedAt: fileMetadata.uploadedAt,
        sourceFileId: fileMetadata.sourceFileId,
        sourceRecordType,
        sourceRecordId,
        vaultPath: buildVaultPath(entityId, folder, fileMetadata.fileName),
        summary,
      };

      return nextDocument;
    } catch (error) {
      console.warn('Failed to persist uploaded source document.', error);
      return null;
    }
  };

  const handleInvoiceSubmit = (payload: InvoiceSubmitPayload) => {
    const numericAmount = Number(payload.amount || 0);

    setData((prev) => {
      const base = prev.invoices?.[0];
      if (!base) return prev;
      const entity = prev.entities[0];
      if (!entity) return prev;
      const issueDate = resolveIssueDate(payload.issueDate || base.issueDate);
      const dueDate = resolveDueDate(issueDate, payload.paymentTerms, payload.dueDate || base.dueDate);
      const invoiceId = `invoice-${Date.now()}`;
      const invoiceNumber =
        payload.invoiceNumberMode === 'manual'
          ? payload.manualInvoiceNumber || `INV-${Date.now()}`
          : buildEntityScopedNumber(entity, 'invoice', '', payload.startingNumber);
      const defaultSettlementPath = getEntitySettlementDefault(entity, prev.workspaceSettings);
      const paymentRailPreference =
        payload.paymentRailPreference ||
        mapSettlementPathToPaymentRail(defaultSettlementPath);
      const acceptsDigitalAssets =
        payload.acceptsDigitalAssets ||
        paymentRailPreference === 'digital_asset' ||
        defaultSettlementPath === 'wallet' ||
        defaultSettlementPath === 'tokenized_credit' ||
        defaultSettlementPath === 'tokenized_debit';
      const verificationRequired =
        acceptsDigitalAssets || prev.workspaceSettings.digitalAssetVerificationRequired;
      const shouldIssueToken = shouldAutoIssueTokens(entity, prev.workspaceSettings);
      const customerName = payload.customerName.trim();
      const { customerId, customers: nextCustomers } = ensureCustomerRecord(prev, entity.id, {
        name: customerName,
        email: payload.recipientEmail,
      });
      const token = shouldIssueToken
        ? buildVerificationToken({
            entityId: entity.id,
            subjectId: invoiceId,
            label: `${invoiceNumber} Verification Token`,
            tokenReference: `ERP-${invoiceNumber}`,
            notes: 'Invoice verification token generated from entity accounting defaults.',
          })
        : null;
      const brandingSnapshot = buildInvoiceBrandingSnapshot(entity, {
        themeColor: payload.themeColor,
        logoName: payload.logoName,
        footerNote: payload.footerNote || payload.paymentInstructions,
        headerStyle: payload.headerStyle,
      });
      const nextDocument = buildErpDocument({
        entityId: entity.id,
        title: invoiceNumber,
        date: issueDate,
        linkedTokenIds: token ? [token.id] : undefined,
        sourceRecordId: invoiceId,
        summary: `Invoice for ${customerName || 'customer'} with ${paymentRailPreference} settlement preference.`,
      });

      const nextRecord = {
        ...base,
        id: invoiceId,
        entityId: entity.id,
        customerId,
        invoiceNumber,
        totalAmount: numericAmount,
        balanceDue: numericAmount,
        status: 'draft',
        deliveryMethod: payload.deliveryMethod,
        deliveryStatus:
          payload.deliveryMethod === 'manual' ? 'draft' : 'ready_to_send',
        recipientEmail: payload.recipientEmail || undefined,
        internalDeliveryTarget: payload.internalDeliveryTarget || undefined,
        paymentRailPreference,
        paymentInstructions:
          payload.paymentInstructions ||
          payload.footerNote ||
          entity.branding?.invoiceFooterNote ||
          undefined,
        paymentLinkLabel: payload.paymentLinkLabel || undefined,
        acceptsDigitalAssets,
        verificationRequired,
        defaultSettlementPath,
        brandingSnapshot,
        linkedTokenIds: token ? [token.id] : undefined,
        linkedDocumentIds: [nextDocument.id],
        notes: payload.notes || brandingSnapshot.footerNote,
        issueDate,
        dueDate,
        subtotal: numericAmount,
        taxAmount:
          payload.taxMode === 'state'
            ? numericAmount *
              ({
                MI: 0.06,
                TN: 0.07,
                OH: 0.0575,
                IN: 0.07,
                FL: 0.06,
                TX: 0.0625,
                CA: 0.0725,
                NY: 0.04,
              }[payload.jurisdiction] ?? 0)
            : 0,
      };
      nextRecord.totalAmount = nextRecord.subtotal + nextRecord.taxAmount;
      nextRecord.balanceDue = nextRecord.totalAmount;

      return {
        ...prev,
        entities:
          payload.invoiceNumberMode === 'manual'
            ? prev.entities
            : prev.entities.map((item) =>
                item.id === entity.id ? incrementEntitySequence(item, 'invoice') : item
              ),
        customers: nextCustomers,
        invoices: [nextRecord, ...(prev.invoices ?? [])],
        documents: [nextDocument, ...(prev.documents ?? [])],
        tokens: token ? [token, ...(prev.tokens ?? [])] : prev.tokens,
      };
    });

    setActiveSubsection('invoices');
    setIsInvoiceModalOpen(false);
  };

  const handleBillSubmit = async (payload: BillSubmitPayload) => {
    const numericAmount = Number(payload.amount || 0);
    const issuedDate = new Date().toISOString().slice(0, 10);
    const billId = `bill-${Date.now()}`;
    const extraction = await analyzeAccountingUpload('bill', payload.uploadedFile);
    const documentRecord = await persistUploadDocument({
      entityId: bills[0]?.entityId ?? data.entities[0]?.id ?? 'entity-unknown',
      folder: 'bills',
      title: `${payload.vendorName || extraction.vendorOrMerchantName || 'Vendor'} Bill Source`,
      summary:
        payload.parsedNotes ||
        payload.description ||
        extraction.summary ||
        'Uploaded bill source document.',
      sourceRecordType: 'bill',
      sourceRecordId: billId,
      file: payload.uploadedFile,
      date: issuedDate,
    });

    setData((prev) => {
      const base = prev.bills?.[0];
      if (!base) return prev;
      const entity = prev.entities[0];
      if (!entity) return prev;
      const { vendorId, vendors: nextVendors } = ensureVendorRecord(prev, entity.id, {
        name: payload.vendorName || extraction.vendorOrMerchantName,
      });
      const billNumber = payload.billNumber || buildEntityScopedNumber(entity, 'bill', '', String(getEntityNextSequence(entity, 'bill')));

      const resolvedAmount = numericAmount || extraction.amount || 0;
      const nextRecord = {
        ...base,
        id: billId,
        entityId: entity.id,
        vendorId,
        billNumber,
        issueDate: issuedDate,
        totalAmount: resolvedAmount,
        subtotal: resolvedAmount,
        balanceDue: resolvedAmount,
        status: 'entered',
        dueDate: payload.dueDate || extraction.date || base.dueDate,
        intakeStatus: payload.uploadedFile ? extraction.status : 'manual',
        extractionSummary: extraction.summary,
        extractedVendorName: extraction.vendorOrMerchantName,
        extractedAmount: extraction.amount,
        extractedDueDate: extraction.date,
        notes: payload.description || payload.parsedNotes || extraction.summary,
        linkedDocumentIds: documentRecord
          ? [documentRecord.id, ...(base.linkedDocumentIds ?? [])]
          : base.linkedDocumentIds,
      };

      return {
        ...prev,
        entities:
          payload.billNumber.trim()
            ? prev.entities
            : prev.entities.map((item) =>
                item.id === entity.id ? incrementEntitySequence(item, 'bill') : item
              ),
        vendors: nextVendors,
        bills: [nextRecord, ...(prev.bills ?? [])],
        documents: documentRecord
          ? [documentRecord, ...(prev.documents ?? [])]
          : prev.documents,
      };
    });

    setActiveSubsection('bills');
    setIsBillModalOpen(false);
  };

  const handleReceiptSubmit = async (payload: ReceiptSubmitPayload) => {
    const numericAmount = Number(payload.amount || 0);
    const extraction = await analyzeAccountingUpload('receipt', payload.uploadedFile);
    const entryDate =
      payload.receiptDate || extraction.date || new Date().toISOString().slice(0, 10);
    const receiptId = `receipt-${Date.now()}`;
    const documentRecord = await persistUploadDocument({
      entityId: receipts[0]?.entityId ?? data.entities[0]?.id ?? 'entity-unknown',
      folder: 'receipts',
      title: `${payload.merchantName || extraction.vendorOrMerchantName || 'Merchant'} Receipt Source`,
      summary:
        payload.parsedNotes ||
        payload.description ||
        extraction.summary ||
        'Uploaded receipt source document.',
      sourceRecordType: 'receipt',
      sourceRecordId: receiptId,
      file: payload.uploadedFile,
      date: entryDate,
    });

    setData((prev) => {
      const base = prev.receipts?.[0];
      if (!base) return prev;
      const entity = prev.entities[0];
      if (!entity) return prev;
      const merchantName = payload.merchantName || extraction.vendorOrMerchantName;
      const { vendorId, vendors: nextVendors } = ensureVendorRecord(prev, entity.id, {
        name: merchantName,
      });
      const resolvedAmount = numericAmount || extraction.amount || 0;
      const matchedBill = prev.bills.find(
        (bill) =>
          bill.entityId === entity.id &&
          bill.vendorId === vendorId &&
          bill.balanceDue > 0 &&
          Math.abs(bill.balanceDue - resolvedAmount) < 0.01
      );
      const expenseId = `exp-${Date.now()}`;
      const nextRecord = {
        ...base,
        id: receiptId,
        entityId: entity.id,
        vendorId,
        receiptDate: entryDate,
        fileName: payload.uploadedFileName || payload.uploadedFile?.name || `receipt-${Date.now()}.jpg`,
        totalAmount: resolvedAmount,
        status: matchedBill ? 'matched' : 'reviewed',
        linkedBillId: matchedBill?.id,
        linkedExpenseId: expenseId,
        intakeStatus: payload.uploadedFile ? extraction.status : 'manual',
        extractionSummary: extraction.summary,
        extractedMerchantName: extraction.vendorOrMerchantName,
        extractedAmount: extraction.amount,
        extractedReceiptDate: extraction.date,
        extractedCategoryHint: extraction.categoryHint,
        notes: payload.description || payload.parsedNotes || extraction.summary,
        linkedDocumentIds: documentRecord
          ? [documentRecord.id, ...(base.linkedDocumentIds ?? [])]
          : base.linkedDocumentIds,
        vaultPath: documentRecord?.vaultPath ?? base.vaultPath,
      };

      return {
        ...prev,
        vendors: nextVendors,
        receipts: [nextRecord, ...(prev.receipts ?? [])],
        expenses: [
          {
            id: expenseId,
            entityId: entity.id,
            vendorId,
            expenseDate: entryDate,
            description:
              payload.description ||
              payload.category ||
              extraction.categoryHint ||
              `${merchantName || 'Merchant'} receipt intake`,
            amount: resolvedAmount,
            currency: 'USD',
            paymentMethod:
              payload.mode === 'manual' ? 'bank' : 'other',
            receiptId: receiptId,
            status: 'approved',
          },
          ...(prev.expenses ?? []),
        ],
        bills: matchedBill
          ? prev.bills.map((bill) =>
              bill.id === matchedBill.id
                ? {
                    ...bill,
                    linkedReceiptIds: [receiptId, ...(bill.linkedReceiptIds ?? [])],
                  }
                : bill
            )
          : prev.bills,
        documents: documentRecord
          ? [documentRecord, ...(prev.documents ?? [])]
          : prev.documents,
      };
    });

    setActiveSubsection('receipts');
    setIsReceiptModalOpen(false);
  };

  const handleCounterpartySubmit = (payload: CounterpartySubmitPayload) => {
    if (!counterpartyModalMode) {
      return;
    }

    setData((prev) => {
      const entity = prev.entities[0];
      if (!entity) return prev;

      if (counterpartyModalMode === 'customer') {
        const { customers: nextCustomers } = ensureCustomerRecord(prev, entity.id, payload);
        return {
          ...prev,
          customers: nextCustomers,
        };
      }

      const { vendors: nextVendors } = ensureVendorRecord(prev, entity.id, payload);
      return {
        ...prev,
        vendors: nextVendors,
      };
    });

    setActiveSubsection(counterpartyModalMode === 'customer' ? 'customers' : 'vendors');
    setCounterpartyModalMode(null);
  };

  const handlePaymentSubmit = (payload: PaymentSubmitPayload) => {
    const amount = Number(payload.amount || 0);
    if (!amount) {
      return;
    }

    setData((prev) => {
      const entity = prev.entities[0];
      if (!entity) return prev;

      const stamp = Date.now();
      const paymentId = `pay-${stamp}`;
      const transactionId = `txn-${stamp}`;
      const settlementId = `set-${stamp}`;
      const journalId = `je-${stamp}`;
      const linkedInvoice = payload.linkedInvoiceId
        ? prev.invoices.find((invoice) => invoice.id === payload.linkedInvoiceId)
        : undefined;
      const linkedBill = payload.linkedBillId
        ? prev.bills.find((bill) => bill.id === payload.linkedBillId)
        : undefined;
      const settlementPath: SettlementPath =
        payload.method === 'wire'
          ? 'wire'
          : payload.method === 'card'
            ? 'card'
            : payload.method === 'cash'
              ? 'cash'
              : payload.method === 'digital_asset'
                ? 'wallet'
                : 'ach';
      const shouldIssueSettlementToken =
        payload.method === 'digital_asset' || prev.workspaceSettings.digitalAssetVerificationRequired;
      const settlementToken = shouldIssueSettlementToken
        ? {
            id: `tok-${settlementId}`,
            entityId: entity.id,
            subjectType: 'settlement' as const,
            subjectId: settlementId,
            label: `${payload.direction === 'incoming' ? 'Receipt' : 'Disbursement'} Settlement Token`,
            status: 'issued' as const,
            tokenStandard: 'internal-proof',
            tokenReference: `SET-${stamp}`,
            issuedAt: new Date().toISOString(),
            proofReference: 'Issued automatically during payment posting.',
            notes: payload.notes || undefined,
          }
        : null;
      const nextPayment = {
        id: paymentId,
        entityId: entity.id,
        direction: payload.direction,
        counterpartyType: payload.counterpartyType,
        counterpartyId: payload.counterpartyId,
        paymentDate: payload.paymentDate || new Date().toISOString().slice(0, 10),
        amount,
        currency: entity.operationalDefaults?.baseCurrency || prev.workspaceSettings.baseCurrency,
        method: payload.method,
        status: 'settled' as const,
        linkedInvoiceIds: payload.linkedInvoiceId ? [payload.linkedInvoiceId] : undefined,
        linkedBillIds: payload.linkedBillId ? [payload.linkedBillId] : undefined,
        linkedTransactionIds: [transactionId],
        linkedSettlementId: settlementId,
        notes: payload.notes || undefined,
      };
      const nextTransaction = {
        id: transactionId,
        entityId: entity.id,
        type: payload.direction === 'incoming' ? 'deposit' as const : 'withdrawal' as const,
        title:
          payload.direction === 'incoming'
            ? `Customer receipt${linkedInvoice ? ` for ${linkedInvoice.invoiceNumber}` : ''}`
            : `Vendor payment${linkedBill ? ` for ${linkedBill.billNumber || linkedBill.id}` : ''}`,
        amount,
        currency: nextPayment.currency,
        date: nextPayment.paymentDate,
        status: 'posted' as const,
        linkedSettlementId: settlementId,
        linkedPaymentIds: [paymentId],
        linkedJournalEntryIds: [journalId],
        linkedTokenIds: settlementToken ? [settlementToken.id] : undefined,
        notes: payload.notes || undefined,
      };
      const nextSettlement = {
        id: settlementId,
        entityId: entity.id,
        linkedTransactionId: transactionId,
        linkedPaymentId: paymentId,
        linkedJournalEntryIds: [journalId],
        path: settlementPath,
        direction: payload.direction,
        status: 'settled' as const,
        liquidCashStage:
          payload.direction === 'incoming'
            ? 'liquid_cash_available' as const
            : 'liquid_cash_released' as const,
        verificationMethod:
          payload.method === 'digital_asset'
            ? 'wallet_confirmation' as const
            : 'bank_confirmation' as const,
        verificationStatus:
          settlementToken || payload.method === 'digital_asset'
            ? 'pending' as const
            : 'verified' as const,
        verificationReference:
          payload.method === 'digital_asset'
            ? 'Awaiting token or wallet verification.'
            : 'ERP payment posting completed.',
        tokenizedProofId: settlementToken?.id,
        linkedTokenIds: settlementToken ? [settlementToken.id] : undefined,
        grossAmount: amount,
        settledAmount: amount,
        currency: nextPayment.currency,
        initiatedAt: nextPayment.paymentDate,
        expectedSettlementDate: nextPayment.paymentDate,
        actualSettlementDate: nextPayment.paymentDate,
        autoReconcileStatus:
          prev.workspaceSettings.autoReconcileJournalEntries ? 'pending' as const : undefined,
        requiresManualReview:
          payload.method === 'digital_asset' || prev.workspaceSettings.requireDocumentLinksForSettlements,
        notes: payload.notes || undefined,
      };
      const journalMemo =
        payload.direction === 'incoming'
          ? `Record payment receipt${linkedInvoice ? ` for ${linkedInvoice.invoiceNumber}` : ''}`
          : `Record disbursement${linkedBill ? ` for ${linkedBill.billNumber || linkedBill.id}` : ''}`;
      const nextJournal = {
        id: journalId,
        entityId: entity.id,
        entryNumber: buildEntityScopedNumber(
          entity,
          'journal',
          '',
          String(getEntityNextSequence(entity, 'journal'))
        ),
        entryDate: nextPayment.paymentDate,
        memo: journalMemo,
        debitAccount:
          payload.direction === 'incoming'
            ? '1000 Operating Cash'
            : linkedBill
              ? '2000 Accounts Payable'
              : '6100 Disbursements',
        creditAccount:
          payload.direction === 'incoming'
            ? linkedInvoice
              ? '1100 Accounts Receivable'
              : '2300 Unapplied Cash'
            : '1000 Operating Cash',
        amount,
        status: 'posted' as const,
        source: 'system' as const,
        linkedTransactionIds: [transactionId],
        linkedSettlementIds: [settlementId],
        autoReconcileStatus:
          (entity.operationalDefaults?.autoReconcileLedgerLinks ??
            prev.workspaceSettings.autoReconcileJournalEntries)
            ? 'pending' as const
            : undefined,
        verificationRequired: prev.workspaceSettings.requireDocumentLinksForSettlements,
      };

      const nextInvoices = linkedInvoice
        ? prev.invoices.map((invoice) =>
            invoice.id === linkedInvoice.id
              ? {
                  ...invoice,
                  balanceDue: Math.max(0, invoice.balanceDue - amount),
                  status:
                    invoice.balanceDue - amount <= 0
                      ? 'paid'
                      : 'partially_paid',
                  linkedPaymentIds: [paymentId, ...(invoice.linkedPaymentIds ?? [])],
                  linkedTransactionIds: [transactionId, ...(invoice.linkedTransactionIds ?? [])],
                }
              : invoice
          )
        : prev.invoices;

      const nextBills = linkedBill
        ? prev.bills.map((bill) =>
            bill.id === linkedBill.id
              ? {
                  ...bill,
                  balanceDue: Math.max(0, bill.balanceDue - amount),
                  status:
                    bill.balanceDue - amount <= 0
                      ? 'paid'
                      : 'partially_paid',
                  linkedPaymentIds: [paymentId, ...(bill.linkedPaymentIds ?? [])],
                  linkedTransactionIds: [transactionId, ...(bill.linkedTransactionIds ?? [])],
                }
              : bill
          )
        : prev.bills;

      return {
        ...prev,
        entities: prev.entities.map((item) =>
          item.id === entity.id ? incrementEntitySequence(item, 'journal') : item
        ),
        invoices: nextInvoices,
        bills: nextBills,
        payments: [nextPayment, ...(prev.payments ?? [])],
        transactions: [nextTransaction, ...(prev.transactions ?? [])],
        settlements: [nextSettlement, ...(prev.settlements ?? [])],
        journalEntries: [nextJournal, ...(prev.journalEntries ?? [])],
        tokens: settlementToken ? [settlementToken, ...(prev.tokens ?? [])] : prev.tokens,
      };
    });

    setActiveSubsection('payments');
    setIsPaymentModalOpen(false);
  };

  const handlePreviewInvoice = (invoiceId: string) => {
    setData((prev) => ({
      ...prev,
      invoices: prev.invoices.map((invoice) =>
        invoice.id === invoiceId
          ? {
              ...invoice,
              lastPreviewedAt: new Date().toISOString(),
              deliveryNotes:
                invoice.deliveryNotes || 'Preview generated from ERP invoice operations workspace.',
            }
          : invoice
      ),
    }));
  };

  const handleSendInvoice = async (invoiceId: string) => {
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) {
      return;
    }

    const customer = customers.find((item) => item.id === invoice.customerId);
    const entity = data.entities.find((item) => item.id === invoice.entityId);
    const recipientEmail = resolveInvoiceRecipientEmail(invoice, customer);
    const emailPayload = buildInvoiceEmailPayload({
      invoice,
      customer,
      entity,
      workspaceSettings: data.workspaceSettings,
    });
    const needsPacketDocument = invoice.deliveryMethod !== 'internal_user';
    const exportDocumentId = needsPacketDocument ? `doc-export-${invoiceId}-${Date.now()}` : null;
    const attachmentFileName = emailPayload.attachmentFileName || buildInvoicePacketFileName(invoice);

    let deliveryResponse:
      | Awaited<ReturnType<typeof queueInvoiceDelivery>>
      | null = null;
    let exportResponse: Awaited<ReturnType<typeof queueInvoiceExport>> | null = null;
    let packetDownload: ReturnType<typeof downloadInvoicePacket> | null = null;
    let deliveryNotes = 'Invoice packet prepared for manual delivery.';
    let deliveryStatus: InvoiceRecord['deliveryStatus'] = 'ready_to_send';

    if (invoice.deliveryMethod === 'internal_user') {
      deliveryResponse = await queueInvoiceDelivery({
        invoiceId: invoice.id,
        entityId: invoice.entityId,
        invoiceNumber: invoice.invoiceNumber,
        deliveryMethod: invoice.deliveryMethod,
        recipientEmail,
        internalDeliveryTarget: invoice.internalDeliveryTarget,
      });
      deliveryNotes = `Internal ClearFlow delivery queued for ${
        invoice.internalDeliveryTarget || 'member'
      }.`;
      deliveryStatus = 'sent';
    } else if (invoice.deliveryMethod === 'email' && recipientEmail) {
      deliveryResponse = await queueInvoiceDelivery({
        invoiceId: invoice.id,
        entityId: invoice.entityId,
        invoiceNumber: invoice.invoiceNumber,
        deliveryMethod: invoice.deliveryMethod,
        recipientEmail,
        internalDeliveryTarget: invoice.internalDeliveryTarget,
        emailSubject: emailPayload.subject,
        emailTextBody: emailPayload.textBody,
        emailHtmlBody: emailPayload.htmlBody,
        attachmentFileName: emailPayload.attachmentFileName,
        attachmentHtml: emailPayload.attachmentHtml,
        replyTo: emailPayload.replyTo,
        fromName: emailPayload.fromName,
      });
      if (deliveryResponse.job.status === 'sent') {
        deliveryNotes = `Invoice emailed directly to ${recipientEmail} as ${emailPayload.fromName} from the configured ClearFlow billing mailbox.`;
        deliveryStatus = 'sent';
      } else {
        exportResponse = await queueInvoiceExport({
          invoiceId: invoice.id,
          entityId: invoice.entityId,
          invoiceNumber: invoice.invoiceNumber,
        });
        packetDownload = downloadInvoicePacket({
          invoice,
          customer,
          entity,
        });
        const openedDraft = openInvoiceEmailDraft({
          invoice,
          customer,
          entity,
          workspaceSettings: data.workspaceSettings,
          attachmentFileName: packetDownload.fileName,
        });
        deliveryNotes = openedDraft
          ? `Server email is not configured yet. Email draft opened for ${recipientEmail} as ${emailPayload.fromName}. Attach ${packetDownload.fileName} and send through your connected mail account.`
          : `Server email is not configured yet. ${packetDownload.fileName} downloaded for manual attachment to ${recipientEmail}.`;
      }
    } else if (invoice.deliveryMethod === 'email') {
      exportResponse = await queueInvoiceExport({
        invoiceId: invoice.id,
        entityId: invoice.entityId,
        invoiceNumber: invoice.invoiceNumber,
      });
      packetDownload = downloadInvoicePacket({
        invoice,
        customer,
        entity,
      });
      deliveryNotes = `No client email is on file. ${packetDownload.fileName} downloaded so you can attach and send manually once an email is available.`;
      deliveryStatus = 'draft';
    } else {
      exportResponse = await queueInvoiceExport({
        invoiceId: invoice.id,
        entityId: invoice.entityId,
        invoiceNumber: invoice.invoiceNumber,
      });
      packetDownload = downloadInvoicePacket({
        invoice,
        customer,
        entity,
      });
      deliveryNotes =
        invoice.deliveryMethod === 'export'
          ? `${packetDownload.fileName} downloaded from the ERP delivery desk for manual attachment or offline delivery.`
          : `${packetDownload.fileName} downloaded for manual invoice delivery.`;
    }

    setData((prev) => ({
      ...prev,
      invoices: prev.invoices.map((invoice) =>
        invoice.id === invoiceId
          ? {
              ...invoice,
              status: invoice.status === 'draft' ? 'issued' : invoice.status,
              recipientEmail: recipientEmail || invoice.recipientEmail,
              deliveryStatus,
              sentAt:
                deliveryStatus === 'sent' ? new Date().toISOString() : invoice.sentAt,
              deliveryJobId: deliveryResponse?.job.id || invoice.deliveryJobId,
              exportJobId: exportResponse?.job.id || invoice.exportJobId,
              exportedAt: needsPacketDocument ? new Date().toISOString() : invoice.exportedAt,
              linkedDocumentIds:
                exportDocumentId && !invoice.linkedDocumentIds?.includes(exportDocumentId)
                  ? [exportDocumentId, ...(invoice.linkedDocumentIds ?? [])]
                  : invoice.linkedDocumentIds,
              deliveryNotes,
            }
          : invoice
      ),
      documents: exportDocumentId
        ? [
            {
              id: exportDocumentId,
              entityId: invoice.entityId,
              title: `${invoice.invoiceNumber} Export Packet`,
              category: 'financial',
              date: new Date().toISOString().slice(0, 10),
              status: 'final',
              sourceRecordType: 'document',
              sourceRecordId: invoiceId,
              fileName: packetDownload?.fileName || attachmentFileName,
              mimeType: 'text/html',
              summary: `Invoice packet prepared for ${invoice.invoiceNumber}.`,
            },
            ...(prev.documents ?? []),
          ]
        : prev.documents,
    }));
  };

  const handleMarkInvoiceViewed = (invoiceId: string) => {
    setData((prev) => ({
      ...prev,
      invoices: prev.invoices.map((invoice) =>
        invoice.id === invoiceId
          ? {
              ...invoice,
              viewedAt: new Date().toISOString(),
              deliveryNotes: 'Counterparty engagement acknowledged in ERP delivery tracking.',
            }
          : invoice
      ),
    }));
  };

  const handleExportInvoice = async (invoiceId: string) => {
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) {
      return;
    }
    const customer = customers.find((item) => item.id === invoice.customerId);
    const entity = data.entities.find((item) => item.id === invoice.entityId);
    const packetDownload = downloadInvoicePacket({
      invoice,
      customer,
      entity,
    });

    const response = await queueInvoiceExport({
      invoiceId: invoice.id,
      entityId: invoice.entityId,
      invoiceNumber: invoice.invoiceNumber,
    });

    setData((prev) => {
      const invoice = prev.invoices.find((item) => item.id === invoiceId);
      if (!invoice) return prev;

      const exportDocument: DocumentRecord = {
        id: `doc-export-${invoiceId}-${Date.now()}`,
        entityId: invoice.entityId,
        title: `${invoice.invoiceNumber} Export Packet`,
        category: 'financial',
        date: new Date().toISOString().slice(0, 10),
        status: 'final',
        fileName: packetDownload.fileName,
        mimeType: 'text/html',
        sourceRecordType: 'document',
        sourceRecordId: invoiceId,
        summary: `Export packet prepared for ${invoice.invoiceNumber}.`,
      };

      return {
        ...prev,
        invoices: prev.invoices.map((item) =>
          item.id === invoiceId
            ? {
                ...item,
                exportedAt: new Date().toISOString(),
                exportJobId: response.job.id,
                linkedDocumentIds: [exportDocument.id, ...(item.linkedDocumentIds ?? [])],
                deliveryNotes: `${packetDownload.fileName} downloaded from the ERP delivery desk.`,
              }
            : item
        ),
        documents: [exportDocument, ...(prev.documents ?? [])],
      };
    });
  };

  const handleCreateReconciliation = (bankAccountId: string) => {
    setData((prev) => {
      const account = prev.bankAccounts.find((item) => item.id === bankAccountId);
      if (!account) return prev;

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);

      return {
        ...prev,
        reconciliations: [
          {
            id: `rec-${Date.now()}`,
            entityId: account.entityId,
            bankAccountId,
            periodStart,
            periodEnd,
            statementEndingBalance: 0,
            clearedTransactionIds: [],
            status: 'open',
            preparedBy: 'ClearFlow Workspace',
            statementReviewStatus: 'not_imported',
            closeApprovalStatus: 'pending',
          },
          ...(prev.reconciliations ?? []),
        ],
      };
    });
  };

  const handleAutoClearReconciliation = (reconciliationId: string) => {
    setData((prev) => {
      const reconciliation = prev.reconciliations.find((item) => item.id === reconciliationId);
      if (!reconciliation) return prev;

      const linkedTransactionIds = prev.payments
        .filter(
          (payment) =>
            payment.entityId === reconciliation.entityId &&
            payment.status === 'settled' &&
            payment.linkedTransactionIds?.length
        )
        .flatMap((payment) => payment.linkedTransactionIds ?? []);
      const unmatchedTransactionIds = prev.transactions
        .filter(
          (transaction) =>
            transaction.entityId === reconciliation.entityId &&
            transaction.status === 'posted' &&
            !linkedTransactionIds.includes(transaction.id)
        )
        .map((transaction) => transaction.id);

      return {
        ...prev,
        reconciliations: prev.reconciliations.map((item) =>
          item.id === reconciliationId
            ? {
                ...item,
                clearedTransactionIds: Array.from(
                  new Set([...(item.clearedTransactionIds ?? []), ...linkedTransactionIds])
                ),
                unmatchedTransactionIds,
                status: 'in_review',
              }
            : item
        ),
      };
    });
  };

  const handleSaveReconciliationStatement = async (
    reconciliationId: string,
    statementEndingBalance: number,
    statementFileName: string,
    exceptionNotes: string,
    statementFile?: File | null
  ) => {
    const reconciliation = reconciliations.find((item) => item.id === reconciliationId);
    if (!reconciliation) {
      return;
    }

    const statementDocument = await persistUploadDocument({
      entityId: reconciliation.entityId,
      folder: 'documents',
      title:
        statementFileName ||
        `Bank Statement ${reconciliation.periodStart} to ${reconciliation.periodEnd}`,
      summary:
        exceptionNotes ||
        'Uploaded reconciliation statement supporting close and exception review.',
      sourceRecordType: 'reconciliation',
      sourceRecordId: reconciliationId,
      file: statementFile,
      date: new Date().toISOString().slice(0, 10),
    });
    const parsedStatement = await parseStatementFileForReconciliation({
      file: statementFile,
      payments: payments.filter((payment) => payment.entityId === reconciliation.entityId),
      transactions: data.transactions.filter(
        (transaction) => transaction.entityId === reconciliation.entityId
      ),
    });

    const response = await importReconciliationStatement({
      reconciliationId,
      bankAccountId: reconciliation.bankAccountId,
      statementEndingBalance,
      statementFileName: statementDocument?.fileName || statementFileName,
      exceptionNotes,
    });

    setData((prev) => ({
      ...prev,
      reconciliations: prev.reconciliations.map((item) =>
        item.id === reconciliationId
          ? {
              ...item,
              statementEndingBalance,
              statementFileName:
                statementDocument?.fileName || statementFileName || item.statementFileName,
              statementImportedAt: new Date().toISOString(),
              statementImportId: response.importJob.id,
              exceptionNotes: exceptionNotes || item.exceptionNotes,
              linkedDocumentIds: statementDocument
                ? [statementDocument.id, ...(item.linkedDocumentIds ?? [])]
                : item.linkedDocumentIds,
              parsedStatementLines: parsedStatement.lines,
              matchedStatementLineIds: parsedStatement.matchedLineIds,
              unmatchedStatementLineIds: parsedStatement.unmatchedLineIds,
              statementReviewStatus: parsedStatement.unmatchedLineIds.length
                ? 'needs_review'
                : parsedStatement.lines.length
                  ? 'ready_to_close'
                  : item.statementReviewStatus ?? 'not_imported',
              closeApprovalStatus: 'pending',
              controllerSignoffName: undefined,
              controllerSignoffAt: undefined,
              closeOverrideReason: undefined,
              notes: [item.notes, parsedStatement.summary].filter(Boolean).join(' | '),
            }
          : item
      ),
      documents: statementDocument
        ? [statementDocument, ...(prev.documents ?? [])]
        : prev.documents,
    }));
  };

  const handleApplySuggestedReconciliationMatches = (reconciliationId: string) => {
    setData((prev) => {
      const reconciliation = prev.reconciliations.find((item) => item.id === reconciliationId);
      if (!reconciliation?.parsedStatementLines?.length) {
        return prev;
      }

      const matchedLineIds: string[] = [];
      const unmatchedLineIds: string[] = [];
      const suggestedTransactionIds = reconciliation.parsedStatementLines.flatMap((line) => {
        if (line.matchStatus === 'suggested' && line.suggestedTransactionIds?.length) {
          matchedLineIds.push(line.id);
          return line.suggestedTransactionIds;
        }

        if (line.matchStatus === 'exception' || line.matchStatus === 'unreviewed') {
          unmatchedLineIds.push(line.id);
        }

        if (line.matchStatus === 'matched') {
          matchedLineIds.push(line.id);
          return line.suggestedTransactionIds ?? [];
        }

        return [];
      });

      return {
        ...prev,
        reconciliations: prev.reconciliations.map((item) =>
          item.id === reconciliationId
            ? {
                ...item,
                clearedTransactionIds: Array.from(
                  new Set([...(item.clearedTransactionIds ?? []), ...suggestedTransactionIds])
                ),
                parsedStatementLines: item.parsedStatementLines?.map((line) =>
                  line.matchStatus === 'suggested'
                    ? { ...line, matchStatus: 'matched' }
                    : line
                ),
                matchedStatementLineIds: matchedLineIds,
                unmatchedStatementLineIds: unmatchedLineIds,
                statementReviewStatus: unmatchedLineIds.length
                  ? 'needs_review'
                  : 'ready_to_close',
                closeApprovalStatus: 'pending',
                controllerSignoffName: undefined,
                controllerSignoffAt: undefined,
                closeOverrideReason: undefined,
                status: 'in_review',
              }
            : item
        ),
      };
    });
  };

  const handleAcceptReconciliationLineSuggestion = (
    reconciliationId: string,
    lineId: string
  ) => {
    setData((prev) => {
      const reconciliation = prev.reconciliations.find((item) => item.id === reconciliationId);
      const targetLine = reconciliation?.parsedStatementLines?.find((line) => line.id === lineId);
      if (!reconciliation || !targetLine) {
        return prev;
      }

      const nextClearedTransactionIds = Array.from(
        new Set([
          ...(reconciliation.clearedTransactionIds ?? []),
          ...(targetLine.suggestedTransactionIds ?? []),
        ])
      );
      const nextMatchedLineIds = Array.from(
        new Set([...(reconciliation.matchedStatementLineIds ?? []), lineId])
      );
      const nextUnmatchedLineIds = (reconciliation.unmatchedStatementLineIds ?? []).filter(
        (item) => item !== lineId
      );

      return {
        ...prev,
        reconciliations: prev.reconciliations.map((item) =>
          item.id === reconciliationId
            ? {
                ...item,
                clearedTransactionIds: nextClearedTransactionIds,
                matchedStatementLineIds: nextMatchedLineIds,
                unmatchedStatementLineIds: nextUnmatchedLineIds,
                parsedStatementLines: item.parsedStatementLines?.map((line) =>
                  line.id === lineId
                    ? {
                        ...line,
                        matchStatus: 'matched',
                        resolvedAt: new Date().toISOString(),
                        notes:
                          line.notes ||
                          'Suggested payment and transaction match accepted by controller review.',
                      }
                    : line
                ),
                statementReviewStatus: nextUnmatchedLineIds.length
                  ? 'needs_review'
                  : 'ready_to_close',
                closeApprovalStatus: 'pending',
                controllerSignoffName: undefined,
                controllerSignoffAt: undefined,
                closeOverrideReason: undefined,
                status: 'in_review',
              }
            : item
        ),
      };
    });
  };

  const handleFlagReconciliationLineException = (
    reconciliationId: string,
    lineId: string
  ) => {
    setData((prev) => {
      const reconciliation = prev.reconciliations.find((item) => item.id === reconciliationId);
      if (!reconciliation?.parsedStatementLines?.length) {
        return prev;
      }

      const nextUnmatchedLineIds = Array.from(
        new Set([...(reconciliation.unmatchedStatementLineIds ?? []), lineId])
      );
      const nextMatchedLineIds = (reconciliation.matchedStatementLineIds ?? []).filter(
        (item) => item !== lineId
      );

      return {
        ...prev,
        reconciliations: prev.reconciliations.map((item) =>
          item.id === reconciliationId
            ? {
                ...item,
                matchedStatementLineIds: nextMatchedLineIds,
                unmatchedStatementLineIds: nextUnmatchedLineIds,
                parsedStatementLines: item.parsedStatementLines?.map((line) =>
                  line.id === lineId
                    ? {
                        ...line,
                        matchStatus: 'exception',
                        notes:
                          line.notes ||
                          'Marked as exception and removed from auto-match flow pending controller resolution.',
                      }
                    : line
                ),
                statementReviewStatus: 'needs_review',
                closeApprovalStatus: 'pending',
                controllerSignoffName: undefined,
                controllerSignoffAt: undefined,
                closeOverrideReason: undefined,
                status: 'in_review',
              }
            : item
        ),
      };
    });
  };

  const handleCreateReconciliationAdjustingEntry = (
    reconciliationId: string,
    lineId: string
  ) => {
    setData((prev) => {
      const reconciliation = prev.reconciliations.find((item) => item.id === reconciliationId);
      const targetLine = reconciliation?.parsedStatementLines?.find((line) => line.id === lineId);
      if (!reconciliation || !targetLine || targetLine.linkedJournalEntryId) {
        return prev;
      }

      const stamp = Date.now();
      const journalId = `je-${stamp}`;
      const transactionId = `txn-${stamp}`;
      const absoluteAmount = Math.abs(targetLine.amount);
      const isDebit = targetLine.direction === 'debit';
      const memo = `Reconciliation adjustment: ${targetLine.description}`;

      const nextTransaction = {
        id: transactionId,
        entityId: reconciliation.entityId,
        type: isDebit ? ('expense' as const) : ('income' as const),
        title: memo,
        amount: absoluteAmount,
        currency: 'USD',
        date: targetLine.postedDate,
        status: 'posted' as const,
        linkedJournalEntryIds: [journalId],
        notes:
          'Created from reconciliation exception workflow to tie imported bank activity back to ERP records.',
      };

      const nextJournal = {
        id: journalId,
        entityId: reconciliation.entityId,
        entryNumber: `JE-${stamp}`,
        entryDate: targetLine.postedDate,
        memo,
        debitAccount: isDebit ? '6855 Bank Fees and Charges' : '1000 Operating Cash',
        creditAccount: isDebit ? '1000 Operating Cash' : '4890 Miscellaneous Income',
        amount: absoluteAmount,
        status: 'posted' as const,
        source: 'system' as const,
        linkedTransactionIds: [transactionId],
        autoReconcileStatus: 'matched' as const,
      };

      const nextClearedTransactionIds = Array.from(
        new Set([...(reconciliation.clearedTransactionIds ?? []), transactionId])
      );
      const nextMatchedLineIds = Array.from(
        new Set([...(reconciliation.matchedStatementLineIds ?? []), lineId])
      );
      const nextUnmatchedLineIds = (reconciliation.unmatchedStatementLineIds ?? []).filter(
        (item) => item !== lineId
      );

      return {
        ...prev,
        bankAccounts: prev.bankAccounts.map((account) =>
          account.id === reconciliation.bankAccountId
            ? {
                ...account,
                currentBalance: Number(((account.currentBalance ?? 0) + targetLine.amount).toFixed(2)),
              }
            : account
        ),
        transactions: [nextTransaction, ...(prev.transactions ?? [])],
        journalEntries: [nextJournal, ...(prev.journalEntries ?? [])],
        reconciliations: prev.reconciliations.map((item) =>
          item.id === reconciliationId
            ? {
                ...item,
                clearedTransactionIds: nextClearedTransactionIds,
                matchedStatementLineIds: nextMatchedLineIds,
                unmatchedStatementLineIds: nextUnmatchedLineIds,
                parsedStatementLines: item.parsedStatementLines?.map((line) =>
                  line.id === lineId
                    ? {
                        ...line,
                        matchStatus: 'matched',
                        suggestedTransactionIds: [transactionId],
                        linkedJournalEntryId: journalId,
                        resolvedAt: new Date().toISOString(),
                        notes:
                          'Adjusting entry created from reconciliation exception workflow.',
                      }
                    : line
                ),
                statementReviewStatus: nextUnmatchedLineIds.length
                  ? 'needs_review'
                  : 'ready_to_close',
                closeApprovalStatus: 'pending',
                controllerSignoffName: undefined,
                controllerSignoffAt: undefined,
                closeOverrideReason: undefined,
                status: 'in_review',
              }
            : item
        ),
      };
    });
  };

  const handleApproveReconciliationClose = (
    reconciliationId: string,
    controllerName: string,
    overrideReason: string
  ) => {
    const reconciliation = reconciliations.find((item) => item.id === reconciliationId);
    if (!reconciliation) {
      return;
    }

    const bankAccount = bankAccounts.find((account) => account.id === reconciliation.bankAccountId);
    const metrics = buildReconciliationCloseMetrics(reconciliation, bankAccount);
    const normalizedName = controllerName.trim();
    const normalizedOverride = overrideReason.trim();

    if (!normalizedName) {
      return;
    }

    const canApprove = metrics.isReadyToApprove || normalizedOverride.length > 0;
    if (!canApprove) {
      return;
    }

    setData((prev) => ({
      ...prev,
      reconciliations: prev.reconciliations.map((item) =>
        item.id === reconciliationId
          ? {
              ...item,
              closeApprovalStatus: 'approved',
              controllerSignoffName: normalizedName,
              controllerSignoffAt: new Date().toISOString(),
              closeOverrideReason: metrics.isReadyToApprove ? undefined : normalizedOverride,
              notes: metrics.isReadyToApprove
                ? item.notes
                : [item.notes, `Controller override approved: ${normalizedOverride}`]
                    .filter(Boolean)
                    .join(' | '),
            }
          : item
      ),
    }));
  };

  const handleMarkReconciliationCompleted = async (
    reconciliationId: string,
    closeSummary: string
  ) => {
    const reconciliation = reconciliations.find((item) => item.id === reconciliationId);
    if (!reconciliation) {
      return;
    }

    const bankAccount = bankAccounts.find((account) => account.id === reconciliation.bankAccountId);
    const metrics = buildReconciliationCloseMetrics(reconciliation, bankAccount);
    const hasApprovedOverride = Boolean(
      reconciliation.closeApprovalStatus === 'approved' && reconciliation.closeOverrideReason?.trim()
    );

    if (reconciliation.closeApprovalStatus !== 'approved') {
      return;
    }

    if (!metrics.isReadyToApprove && !hasApprovedOverride) {
      return;
    }

    const response = await closeReconciliationJob({
      reconciliationId,
      closeSummary,
      exceptionNotes: reconciliation.exceptionNotes,
    });

    setData((prev) => ({
      ...prev,
      reconciliations: prev.reconciliations.map((item) =>
        item.id === reconciliationId
          ? {
              ...item,
              status: 'completed',
              reviewedBy: 'ClearFlow Workspace',
              closedAt: new Date().toISOString(),
              closeJobId: response.closeJob.id,
              closeSummary: closeSummary || item.closeSummary,
              statementReviewStatus: 'completed',
              closeApprovalStatus: 'closed',
            }
          : item
      ),
    }));
  };

  const handleJournalSubmit = (payload: JournalSubmitPayload) => {
    setData((prev) => ({
      ...prev,
      entities:
        payload.entryNumber.trim()
          ? prev.entities
          : prev.entities.map((item, index) =>
              index === 0 ? incrementEntitySequence(item, 'journal') : item
            ),
      journalEntries: [
        {
          id: `journal-${Date.now()}`,
          entityId: prev.entities[0]?.id ?? 'entity-unknown',
          entryNumber:
            payload.entryNumber ||
            buildEntityScopedNumber(prev.entities[0], 'journal', '', String(getEntityNextSequence(prev.entities[0], 'journal'))),
          entryDate: payload.entryDate || new Date().toISOString().slice(0, 10),
          memo: payload.memo,
          debitAccount: payload.debitAccount,
          creditAccount: payload.creditAccount,
          amount: Number(payload.amount || 0),
          status: 'posted',
          source: 'manual',
          verificationRequired: prev.workspaceSettings.requireDocumentLinksForSettlements,
          autoReconcileStatus:
            (prev.entities[0]?.operationalDefaults?.autoReconcileLedgerLinks ??
              prev.workspaceSettings.autoReconcileJournalEntries)
              ? 'pending'
              : undefined,
        },
        ...(prev.journalEntries ?? []),
      ],
    }));

    setActiveSubsection('dashboard');
    setIsJournalModalOpen(false);
  };

  const handleQuoteSubmit = (payload: QuoteSubmitPayload) => {
    const numericAmount = Number(payload.amount || 0);

    setData((prev) => {
      const base = prev.invoices?.[0];
      if (!base) return prev;
      const entity = prev.entities[0];
      if (!entity) return prev;
      const issueDate = resolveIssueDate(base.issueDate);
      const quoteId = `quote-${Date.now()}`;
      const quoteNumber =
        payload.quoteNumberMode === 'manual'
          ? payload.manualQuoteNumber || `QUOTE-${Date.now()}`
          : buildEntityScopedNumber(entity, 'quote', '', payload.startingNumber);
      const shouldIssueToken = shouldAutoIssueTokens(entity, prev.workspaceSettings);
      const token = shouldIssueToken
        ? buildVerificationToken({
            entityId: entity.id,
            subjectId: quoteId,
            label: `${quoteNumber} Proposal Token`,
            tokenReference: `QTE-${quoteNumber}`,
            notes: 'Quote token generated from entity accounting defaults.',
          })
        : null;
      const brandingSnapshot = buildInvoiceBrandingSnapshot(entity, {
        themeColor: payload.themeColor,
        logoName: payload.logoName,
      });
      const nextDocument = buildErpDocument({
        entityId: entity.id,
        title: quoteNumber,
        date: issueDate,
        linkedTokenIds: token ? [token.id] : undefined,
        sourceRecordId: quoteId,
        summary: `Quote for ${payload.customerName || 'customer'}: ${payload.projectTitle}.`,
      });

      const nextRecord = {
        ...base,
        id: quoteId,
        entityId: entity.id,
        invoiceNumber: quoteNumber,
        issueDate,
        totalAmount: numericAmount,
        balanceDue: numericAmount,
        status: 'draft',
        brandingSnapshot,
        linkedDocumentIds: [nextDocument.id],
        linkedTokenIds: token ? [token.id] : undefined,
        verificationRequired: token !== null,
        notes: `${payload.projectTitle}${payload.notes ? ` | ${payload.notes}` : ''}`,
      };

      return {
        ...prev,
        entities:
          payload.quoteNumberMode === 'manual'
            ? prev.entities
            : prev.entities.map((item) =>
                item.id === entity.id ? incrementEntitySequence(item, 'quote') : item
              ),
        invoices: [nextRecord, ...(prev.invoices ?? [])],
        documents: [nextDocument, ...(prev.documents ?? [])],
        tokens: token ? [token, ...(prev.tokens ?? [])] : prev.tokens,
      };
    });

    setActiveSubsection('quotes');
    setIsQuoteModalOpen(false);
  };

  const handleIntercompanySubmit = (payload: InterEntityTransferSubmitPayload) => {
    const amount = Number(payload.amount || 0);
    if (!payload.fromEntityId || !payload.toEntityId || payload.fromEntityId === payload.toEntityId) {
      return;
    }

    const fromEntity =
      data.entities.find((entity) => entity.id === payload.fromEntityId) ?? data.entities[0];
    const toEntity =
      data.entities.find((entity) => entity.id === payload.toEntityId) ?? data.entities[1];

    if (!fromEntity || !toEntity) {
      return;
    }

    const stamp = Date.now();
    const transferGroupId = `iet-${stamp}`;
    const originTransactionId = `txn-${stamp}-from`;
    const destinationTransactionId = `txn-${stamp}-to`;
    const originSettlementId = `set-${stamp}-from`;
    const destinationSettlementId = `set-${stamp}-to`;
    const originPaymentId = `pay-${stamp}-from`;
    const destinationPaymentId = `pay-${stamp}-to`;
    const originJournalId = `je-${stamp}-from`;
    const destinationJournalId = `je-${stamp}-to`;
    const entryDate = payload.effectiveDate || new Date().toISOString().slice(0, 10);
    const memo = payload.memo || `Intercompany move from ${fromEntity.name} to ${toEntity.name}`;
    const originReceivable = `1450 Due From ${toEntity.name}`;
    const destinationPayable = `2400 Due To ${fromEntity.name}`;

    setData((prev) => ({
      ...prev,
      transactions: [
        {
          id: originTransactionId,
          entityId: fromEntity.id,
          type: 'transfer',
          title: memo,
          amount,
          currency: 'USD',
          date: entryDate,
          status: 'posted',
          linkedSettlementId: originSettlementId,
          linkedPaymentIds: [originPaymentId],
          linkedJournalEntryIds: [originJournalId],
          counterpartyEntityId: toEntity.id,
          sharedTransferGroupId: transferGroupId,
          ledgerSide: 'origin',
          notes: 'Origin half of ERP-posted intercompany transfer.',
        },
        {
          id: destinationTransactionId,
          entityId: toEntity.id,
          type: 'deposit',
          title: memo,
          amount,
          currency: 'USD',
          date: entryDate,
          status: 'posted',
          linkedSettlementId: destinationSettlementId,
          linkedPaymentIds: [destinationPaymentId],
          linkedJournalEntryIds: [destinationJournalId],
          counterpartyEntityId: fromEntity.id,
          sharedTransferGroupId: transferGroupId,
          ledgerSide: 'destination',
          notes: 'Destination half of ERP-posted intercompany transfer.',
        },
        ...(prev.transactions ?? []),
      ],
      payments: [
        {
          id: originPaymentId,
          entityId: fromEntity.id,
          direction: 'outgoing',
          counterpartyType: 'other',
          paymentDate: entryDate,
          amount,
          currency: 'USD',
          method: 'internal_transfer',
          status: 'settled',
          linkedTransactionIds: [originTransactionId],
          linkedSettlementId: originSettlementId,
          notes: `Mirrored origin payment to ${toEntity.name}.`,
        },
        {
          id: destinationPaymentId,
          entityId: toEntity.id,
          direction: 'incoming',
          counterpartyType: 'other',
          paymentDate: entryDate,
          amount,
          currency: 'USD',
          method: 'internal_transfer',
          status: 'settled',
          linkedTransactionIds: [destinationTransactionId],
          linkedSettlementId: destinationSettlementId,
          notes: `Mirrored receipt from ${fromEntity.name}.`,
        },
        ...(prev.payments ?? []),
      ],
      settlements: [
        {
          id: originSettlementId,
          entityId: fromEntity.id,
          linkedTransactionId: originTransactionId,
          linkedPaymentId: originPaymentId,
          linkedJournalEntryIds: [originJournalId],
          path: 'internal_ledger',
          direction: 'outgoing',
          status: 'settled',
          liquidCashStage: 'liquid_cash_released',
          verificationMethod: 'manual_override',
          verificationStatus: 'verified',
          verificationReference:
            payload.settlementMode === 'mirrored_halves'
              ? 'Origin entity reconciles only its own half of the intercompany move.'
              : 'Cross-entity clearing allowed, but origin books remain independently traceable.',
          grossAmount: amount,
          settledAmount: amount,
          currency: 'USD',
          initiatedAt: entryDate,
          expectedSettlementDate: entryDate,
          actualSettlementDate: entryDate,
          autoReconcileStatus: 'matched',
          notes: memo,
        },
        {
          id: destinationSettlementId,
          entityId: toEntity.id,
          linkedTransactionId: destinationTransactionId,
          linkedPaymentId: destinationPaymentId,
          linkedJournalEntryIds: [destinationJournalId],
          path: 'internal_ledger',
          direction: 'incoming',
          status: 'settled',
          liquidCashStage: 'liquid_cash_available',
          verificationMethod: 'manual_override',
          verificationStatus: 'verified',
          verificationReference:
            payload.settlementMode === 'mirrored_halves'
              ? 'Destination entity reconciles only its own half of the intercompany move.'
              : 'Cross-entity clearing allowed, but destination books remain independently traceable.',
          grossAmount: amount,
          settledAmount: amount,
          currency: 'USD',
          initiatedAt: entryDate,
          expectedSettlementDate: entryDate,
          actualSettlementDate: entryDate,
          autoReconcileStatus: 'matched',
          notes: memo,
        },
        ...(prev.settlements ?? []),
      ],
      journalEntries: [
        {
          id: originJournalId,
          entityId: fromEntity.id,
          entryNumber: `JE-${stamp}-A`,
          entryDate,
          memo,
          debitAccount: originReceivable,
          creditAccount: payload.fromCashAccount || '1000 Operating Cash',
          amount,
          status: 'posted',
          source: 'system',
          linkedTransactionIds: [originTransactionId],
          linkedSettlementIds: [originSettlementId],
          autoReconcileStatus: 'matched',
        },
        {
          id: destinationJournalId,
          entityId: toEntity.id,
          entryNumber: `JE-${stamp}-B`,
          entryDate,
          memo,
          debitAccount: payload.toCashAccount || '1000 Operating Cash',
          creditAccount: destinationPayable,
          amount,
          status: 'posted',
          source: 'system',
          linkedTransactionIds: [destinationTransactionId],
          linkedSettlementIds: [destinationSettlementId],
          autoReconcileStatus: 'matched',
        },
        ...(prev.journalEntries ?? []),
      ],
      interEntityTransfers: [
        {
          id: transferGroupId,
          transferGroupId,
          fromEntityId: fromEntity.id,
          toEntityId: toEntity.id,
          fromTransactionId: originTransactionId,
          toTransactionId: destinationTransactionId,
          amount,
          currency: 'USD',
          effectiveDate: entryDate,
          settlementMode: payload.settlementMode,
          status: 'settled',
          memo,
        },
        ...(prev.interEntityTransfers ?? []),
      ],
    }));

    setActiveSubsection('intercompany');
    setIsIntercompanyModalOpen(false);
  };

  const renderSubsection = () => {
    switch (activeSubsection) {
      case 'dashboard':
        return (
          <AccountingDashboardSection
            stats={stats}
            journalDrafts={journalEntries}
            bills={bills}
          />
        );

      case 'customers':
        return (
          <EditableRecordSection
            title="Customers"
            description="Editable customer records."
            emptyMessage="No customer records yet."
            records={customers}
            getTitle={(record) => record.name ?? record.id}
            getSubtitle={(record) => record.status ?? 'active'}
            onSave={(nextRecord) =>
              setData((prev) => ({
                ...prev,
                customers: updateCollectionRecord(prev.customers, nextRecord),
              }))
            }
          />
        );

      case 'vendors':
        return (
          <EditableRecordSection
            title="Vendors"
            description="Editable vendor records."
            emptyMessage="No vendor records yet."
            records={vendors}
            getTitle={(record) => record.name ?? record.id}
            getSubtitle={(record) => record.status ?? 'active'}
            onSave={(nextRecord) =>
              setData((prev) => ({
                ...prev,
                vendors: updateCollectionRecord(prev.vendors, nextRecord),
              }))
            }
          />
        );

      case 'invoices':
        return (
          <div style={{ display: 'grid', gap: 16 }}>
            <InvoiceOperationsWorkspace
              invoices={standardInvoices}
              customers={customers}
              entities={data.entities}
              onPreview={handlePreviewInvoice}
              onSend={handleSendInvoice}
              onMarkViewed={handleMarkInvoiceViewed}
              onExport={handleExportInvoice}
            />
            <EditableRecordSection
              title="Invoices"
              description="Editable invoice records."
              emptyMessage="No invoice records yet."
              records={standardInvoices}
              getTitle={(record) => record.invoiceNumber ?? record.id}
              getSubtitle={(record) =>
                `${record.status ?? 'draft'} | ${record.deliveryMethod} | ${record.deliveryStatus ?? 'draft'} | ${formatCurrency(record.totalAmount, record.currency)}`
              }
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  invoices: updateCollectionRecord(prev.invoices, nextRecord),
                }))
              }
            />
          </div>
        );

      case 'quotes':
        return (
          <EditableRecordSection
            title="Quotes"
            description="Draft quote and estimate records."
            emptyMessage="No quote records yet."
            records={quoteRecords}
            getTitle={(record) => record.invoiceNumber ?? record.id}
            getSubtitle={(record) =>
              `${record.status ?? 'draft'} | ${formatCurrency(record.totalAmount, record.currency)}`
            }
            onSave={(nextRecord) =>
              setData((prev) => ({
                ...prev,
                invoices: updateCollectionRecord(prev.invoices, nextRecord),
              }))
            }
          />
        );

      case 'bills':
        return (
          <EditableRecordSection
            title="Bills"
            description="Editable bill records."
            emptyMessage="No bill records yet."
            records={bills}
            getTitle={(record) => record.billNumber ?? record.id}
            getSubtitle={(record) =>
              `${record.status ?? 'entered'} | ${record.intakeStatus ?? 'manual'} | ${formatCurrency(record.totalAmount, record.currency)}`
            }
            onSave={(nextRecord) =>
              setData((prev) => ({
                ...prev,
                bills: updateCollectionRecord(prev.bills, nextRecord),
              }))
            }
          />
        );

      case 'expenses':
        return (
          <EditableRecordSection
            title="Expenses"
            description="Editable expense records."
            emptyMessage="No expense records yet."
            records={expenses}
            getTitle={(record) => record.description ?? record.id}
            getSubtitle={(record) =>
              `${record.status ?? 'draft'} | ${formatCurrency(record.amount, record.currency)}`
            }
            onSave={(nextRecord) =>
              setData((prev) => ({
                ...prev,
                expenses: updateCollectionRecord(prev.expenses, nextRecord),
              }))
            }
          />
        );

      case 'receipts':
        return (
          <EditableRecordSection
            title="Receipts"
            description="Editable receipt records."
            emptyMessage="No receipt records yet."
            records={receipts}
            getTitle={(record) => record.fileName ?? record.id}
            getSubtitle={(record) =>
              `${record.status ?? 'unreviewed'} | ${record.intakeStatus ?? 'manual'} | ${formatCurrency(record.totalAmount, record.currency)}`
            }
            onSave={(nextRecord) =>
              setData((prev) => ({
                ...prev,
                receipts: updateCollectionRecord(prev.receipts, nextRecord),
              }))
            }
          />
        );

      case 'payments':
        return (
          <EditableRecordSection
            title="Payments"
            description="Incoming and outgoing payment postings with linked document application."
            emptyMessage="No payment records yet."
            records={payments}
            getTitle={(record) => record.id}
            getSubtitle={(record) =>
              `${record.direction} | ${record.status} | ${record.method} | ${formatCurrency(record.amount, record.currency)}`
            }
            onSave={(nextRecord) =>
              setData((prev) => ({
                ...prev,
                payments: updateCollectionRecord(prev.payments, nextRecord),
              }))
            }
          />
        );

      case 'intercompany':
        return (
          <EditableRecordSection
            title="Intercompany Transfers"
            description="Mirrored entity-to-entity moves with due-from and due-to posting support."
            emptyMessage="No intercompany transfers yet."
            records={interEntityTransfers}
            getTitle={(record) => `${record.fromEntityId} -> ${record.toEntityId}`}
            getSubtitle={(record) =>
              `${record.settlementMode} | ${record.status} | ${formatCurrency(record.amount, record.currency)}`
            }
            onSave={(nextRecord) =>
              setData((prev) => ({
                ...prev,
                interEntityTransfers: updateCollectionRecord(prev.interEntityTransfers, nextRecord),
              }))
            }
          />
        );

      case 'reconciliation':
        return (
          <PageSection
            title="Reconciliation"
            description="Clear settled payment activity into bank recs and close periods cleanly."
          >
            <ReconciliationWorkspace
              bankAccounts={bankAccounts}
              reconciliations={reconciliations}
              payments={payments}
              onCreateReconciliation={handleCreateReconciliation}
              onAutoClear={handleAutoClearReconciliation}
              onSaveStatement={handleSaveReconciliationStatement}
              onApplySuggestedMatches={handleApplySuggestedReconciliationMatches}
              onAcceptLineSuggestion={handleAcceptReconciliationLineSuggestion}
              onFlagLineException={handleFlagReconciliationLineException}
              onCreateAdjustingEntry={handleCreateReconciliationAdjustingEntry}
              onApproveClose={handleApproveReconciliationClose}
              onMarkCompleted={handleMarkReconciliationCompleted}
            />
          </PageSection>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <CounterpartyModal
        open={counterpartyModalMode !== null}
        mode={counterpartyModalMode ?? 'customer'}
        onClose={() => setCounterpartyModalMode(null)}
        onSubmit={handleCounterpartySubmit}
      />
      <InvoiceQuickAddModal
        open={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        defaultEntityName={defaultEntity?.displayName || defaultEntity?.name}
        defaultThemeColor={
          defaultEntity?.branding?.accentColor || data.workspaceSettings.preferredAccentColor
        }
        defaultLogoName={
          defaultEntity?.branding?.documentLogoText ||
          defaultEntity?.displayName ||
          defaultEntity?.name
        }
        defaultFooterNote={defaultEntity?.branding?.invoiceFooterNote}
        defaultStartingNumber={String(getEntityNextSequence(defaultEntity, 'invoice'))}
        defaultJurisdiction={defaultEntity?.jurisdiction || data.workspaceSettings.defaultJurisdiction}
        defaultPaymentRailPreference={mapSettlementPathToPaymentRail(
          getEntitySettlementDefault(defaultEntity, data.workspaceSettings)
        )}
        defaultAcceptsDigitalAssets={
          getEntitySettlementDefault(defaultEntity, data.workspaceSettings) === 'wallet' ||
          getEntitySettlementDefault(defaultEntity, data.workspaceSettings) === 'tokenized_credit' ||
          getEntitySettlementDefault(defaultEntity, data.workspaceSettings) === 'tokenized_debit'
        }
        onSubmit={handleInvoiceSubmit}
      />
      <BillIntakeModal
        open={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        onSubmit={handleBillSubmit}
      />
      <ReceiptIntakeModal
        open={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        onSubmit={handleReceiptSubmit}
      />
      <PaymentRecordModal
        open={isPaymentModalOpen}
        customers={customers}
        vendors={vendors}
        invoices={standardInvoices}
        bills={bills}
        onClose={() => setIsPaymentModalOpen(false)}
        onSubmit={handlePaymentSubmit}
      />
      <JournalEntryModal
        open={isJournalModalOpen}
        onClose={() => setIsJournalModalOpen(false)}
        defaultEntryNumber={buildEntityScopedNumber(
          defaultEntity,
          'journal',
          '',
          String(getEntityNextSequence(defaultEntity, 'journal'))
        )}
        autoReconcileEnabled={
          defaultEntity?.operationalDefaults?.autoReconcileLedgerLinks ??
          data.workspaceSettings.autoReconcileJournalEntries
        }
        onSubmit={handleJournalSubmit}
      />
      <QuoteBuilderModal
        open={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
        defaultEntityName={defaultEntity?.displayName || defaultEntity?.name}
        defaultThemeColor={
          defaultEntity?.branding?.accentColor || data.workspaceSettings.preferredAccentColor
        }
        defaultLogoName={
          defaultEntity?.branding?.documentLogoText ||
          defaultEntity?.displayName ||
          defaultEntity?.name
        }
        defaultStartingNumber={String(getEntityNextSequence(defaultEntity, 'quote'))}
        defaultJurisdiction={defaultEntity?.jurisdiction || data.workspaceSettings.defaultJurisdiction}
        onSubmit={handleQuoteSubmit}
      />
      <InterEntityTransferModal
        open={isIntercompanyModalOpen}
        entities={data.entities}
        onClose={() => setIsIntercompanyModalOpen(false)}
        onSubmit={handleIntercompanySubmit}
      />

      <div style={shellStyle}>
        <PageSection
          title="Accounting"
          description="ERP accounting workspace for receivables, payables, journal workflow, intake, and reconciliation."
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <AccountingToolbar
              onAddCustomer={() => setCounterpartyModalMode('customer')}
              onAddVendor={() => setCounterpartyModalMode('vendor')}
              onAddInvoice={() => setIsInvoiceModalOpen(true)}
              onRecordPayment={() => setIsPaymentModalOpen(true)}
              onAddJournalEntry={() => setIsJournalModalOpen(true)}
              onAddBill={() => setIsBillModalOpen(true)}
              onAddReceipt={() => setIsReceiptModalOpen(true)}
              onGenerateQuote={() => setIsQuoteModalOpen(true)}
              onAddIntercompanyTransfer={() => setIsIntercompanyModalOpen(true)}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {subnavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSubsection(item.id)}
                  style={sectionButtonStyle(item.id === activeSubsection)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </PageSection>

        {renderSubsection()}
      </div>
    </>
  );
}
