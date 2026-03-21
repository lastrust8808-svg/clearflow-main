import { useEffect, useMemo, useState } from 'react';
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
import { syncBankFeedToLedger } from '../../services/bankFeed.service';
import { plaidService } from '../../services/plaid.service';
import { executeSettlementProcessing } from '../../services/settlementExecution.service';
import {
  canUseInjectedWalletExecution,
  executeInjectedWalletPayment,
  pollInjectedWalletTransaction,
} from '../../services/walletExecution.service';
import AccountingDashboardSection from '../accounting/AccountingDashboardSection';
import AccountingToolbar from '../accounting/AccountingToolbar';
import BankFeedWorkspace from '../accounting/BankFeedWorkspace';
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
import RemittanceOperationsWorkspace from '../accounting/RemittanceOperationsWorkspace';
import ReceiptIntakeModal from '../accounting/ReceiptIntakeModal';
import { PlaidLinkModal } from '../plaid-link-modal/PlaidLinkModal';
import type {
  AccountingSection,
  BankFeedRuleSubmitPayload,
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
import type { PlaidConnectionPayload } from '../../types/app.models';

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
  const [isPlaidModalOpen, setIsPlaidModalOpen] = useState(false);
  const [selectedBankFeedAccountId, setSelectedBankFeedAccountId] = useState<string | null>(null);
  const [counterpartyModalMode, setCounterpartyModalMode] =
    useState<'customer' | 'vendor' | null>(null);
  const [operationsNotice, setOperationsNotice] = useState('');

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
  const bankFeedRules = data.bankFeedRules ?? [];
  const bankFeedEntries = data.bankFeedEntries ?? [];
  const reconciliations = data.reconciliations ?? [];
  const ledgerAccounts = data.ledgerAccounts ?? [];
  const treasuryAccounts = data.treasuryAccounts ?? [];
  const wallets = data.wallets ?? [];
  const digitalAssets = data.digitalAssets ?? [];

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
    payload: {
      name?: string;
      email?: string;
      phone?: string;
      address?: string;
      notes?: string;
      routingNumber?: string;
      accountNumber?: string;
      bankName?: string;
      beneficiaryName?: string;
      accountType?: 'checking' | 'savings' | 'business_checking' | 'other';
      railPreference?: 'ach' | 'eft' | 'wire';
      remittanceEmail?: string;
      digitalWalletAddress?: string;
      digitalWalletNetwork?: string;
      digitalAssetSymbol?: string;
    },
  ) => {
    const normalizedName = payload.name?.trim();
    const paymentInstructions =
      payload.routingNumber || payload.accountNumber || payload.bankName || payload.beneficiaryName
        ? {
            beneficiaryName: payload.beneficiaryName || normalizedName,
            bankName: payload.bankName || undefined,
            routingNumber: payload.routingNumber || undefined,
            accountNumber: payload.accountNumber || undefined,
            accountMask: payload.accountNumber ? payload.accountNumber.slice(-4) : undefined,
            accountType: payload.accountType,
            railPreference: payload.railPreference,
            remittanceEmail: payload.remittanceEmail || payload.email || undefined,
            digitalWalletAddress: payload.digitalWalletAddress || undefined,
            digitalWalletNetwork: payload.digitalWalletNetwork || undefined,
            digitalAssetSymbol: payload.digitalAssetSymbol || undefined,
            verificationStatus:
              payload.routingNumber?.length === 9 ? ('routing_valid' as const) : ('unverified' as const),
            lastValidatedAt:
              payload.routingNumber?.length === 9 ? new Date().toISOString() : undefined,
          }
        : undefined;

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
        vendors: prev.vendors.map((record) =>
          record.id === existingVendor.id
            ? {
                ...record,
                email: payload.email || record.email,
                phone: payload.phone || record.phone,
                remitAddress: payload.address || record.remitAddress,
                notes: payload.notes || record.notes,
                paymentInstructions: paymentInstructions
                  ? {
                      ...record.paymentInstructions,
                      ...paymentInstructions,
                      accountMask:
                        paymentInstructions.accountMask ||
                        record.paymentInstructions?.accountMask,
                    }
                  : record.paymentInstructions,
              }
            : record
        ),
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
          paymentInstructions,
          notes: payload.notes || undefined,
        },
        ...prev.vendors,
      ],
    };
  };

  const resolveLedgerBalance = (
    currentBalance: number,
    direction: 'incoming' | 'outgoing',
    amount: number
  ) => Number((currentBalance + (direction === 'incoming' ? amount : -amount)).toFixed(2));

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

  const handlePaymentSubmit = async (payload: PaymentSubmitPayload) => {
    const amount = Number(payload.amount || 0);
    if (!amount) {
      return;
    }

    const entity = data.entities[0];
    if (!entity) {
      return;
    }

    const stamp = Date.now();
    const paymentId = `pay-${stamp}`;
    const transactionId = `txn-${stamp}`;
    const settlementId = `set-${stamp}`;
    const journalId = `je-${stamp}`;
    const remittanceStatementId = `remit-${stamp}`;
    const instrumentSettlementId = `ins-${stamp}`;
    const linkedInvoice = payload.linkedInvoiceId
      ? data.invoices.find((invoice) => invoice.id === payload.linkedInvoiceId)
      : undefined;
    const linkedBill = payload.linkedBillId
      ? data.bills.find((bill) => bill.id === payload.linkedBillId)
      : undefined;
    const selectedVendor =
      payload.counterpartyType === 'vendor' && payload.counterpartyId
        ? data.vendors.find((vendor) => vendor.id === payload.counterpartyId)
        : undefined;
    const selectedCustomer =
      payload.counterpartyType === 'customer' && payload.counterpartyId
        ? data.customers.find((customer) => customer.id === payload.counterpartyId)
        : undefined;
    const selectedTreasuryAccount = payload.treasuryAccountId
      ? data.treasuryAccounts.find((account) => account.id === payload.treasuryAccountId)
      : undefined;
    const treasuryLinkedLedgerAccount = selectedTreasuryAccount?.linkedLedgerAccountId
      ? data.ledgerAccounts.find(
          (account) => account.id === selectedTreasuryAccount.linkedLedgerAccountId
        )
      : undefined;
    const selectedWallet = payload.linkedWalletId
      ? data.wallets.find((wallet) => wallet.id === payload.linkedWalletId)
      : undefined;
    const selectedDigitalAsset = payload.linkedDigitalAssetId
      ? data.digitalAssets.find((asset) => asset.id === payload.linkedDigitalAssetId)
      : selectedWallet
        ? data.digitalAssets.find((asset) => asset.walletId === selectedWallet.id)
        : undefined;
    const selectedDigitalLedgerAccount = selectedDigitalAsset?.linkedLedgerAccountId
      ? data.ledgerAccounts.find((account) => account.id === selectedDigitalAsset.linkedLedgerAccountId)
      : undefined;
    const fallbackBankAccount = data.bankAccounts.find(
      (account) =>
        account.entityId === entity.id &&
        account.status === 'active' &&
        (payload.method === 'wire'
          ? account.wireEnabled !== false
          : payload.method === 'ach'
            ? account.achOriginationEnabled !== false
            : true)
    );
    const fallbackLedgerAccount = data.ledgerAccounts.find(
      (account) =>
        account.entityId === entity.id &&
        (account.remittanceEligible ||
          account.remittanceClassification === 'cash' ||
          account.remittanceClassification === 'obligation')
    );
    const sourceBankAccount =
      data.bankAccounts.find((account) => account.id === payload.sourceBankAccountId) ||
      (payload.sourceLedgerAccountId || payload.treasuryAccountId || payload.method === 'digital_asset'
        ? undefined
        : fallbackBankAccount);
    const sourceLedgerAccount =
      data.ledgerAccounts.find((account) => account.id === payload.sourceLedgerAccountId) ||
      treasuryLinkedLedgerAccount ||
      (!sourceBankAccount && payload.method !== 'digital_asset' ? fallbackLedgerAccount : undefined);
    const resolvedDischargeMethod: NonNullable<PaymentSubmitPayload['dischargeMethod']> =
      payload.dischargeMethod ||
      (payload.method === 'digital_asset'
        ? 'mixed_discharge'
        : selectedTreasuryAccount || sourceLedgerAccount
          ? 'internal_ledger_credit'
          : 'bank_rail_payment');
    const requiresSettlementExecution =
      payload.direction === 'outgoing' &&
      payload.counterpartyType === 'vendor' &&
      (payload.method === 'ach' || payload.method === 'wire');
    const requiresWalletExecution =
      payload.direction === 'outgoing' &&
      payload.counterpartyType === 'vendor' &&
      payload.method === 'digital_asset' &&
      Boolean(selectedWallet);
    const settlementExecutionResponse = requiresSettlementExecution
      ? await executeSettlementProcessing({
          entityId: entity.id,
          paymentId,
          settlementId,
          amount,
          currency: entity.operationalDefaults?.baseCurrency || data.workspaceSettings.baseCurrency,
          direction: payload.direction,
          method: payload.method,
          urgency: payload.urgency,
          sourceBankAccount: sourceBankAccount
            ? {
                id: sourceBankAccount.id,
                institutionName: sourceBankAccount.institutionName,
                routingNumber: sourceBankAccount.routingNumber,
                accountNumber: sourceBankAccount.accountNumber,
                achOriginationEnabled: sourceBankAccount.achOriginationEnabled,
                wireEnabled: sourceBankAccount.wireEnabled,
                connectionType: sourceBankAccount.connectionType,
              }
            : null,
          sourceLedgerAccount: sourceLedgerAccount
            ? {
                id: sourceLedgerAccount.id,
                name: sourceLedgerAccount.name,
                remittanceEligible: sourceLedgerAccount.remittanceEligible,
                remittanceClassification: sourceLedgerAccount.remittanceClassification,
              }
            : selectedTreasuryAccount
              ? {
                  id: selectedTreasuryAccount.id,
                  name: selectedTreasuryAccount.name,
                  remittanceEligible: selectedTreasuryAccount.remittanceEnabled,
                  remittanceClassification: selectedTreasuryAccount.treasuryType,
                }
            : null,
          vendorInstruction: selectedVendor?.paymentInstructions
            ? {
                beneficiaryName:
                  selectedVendor.paymentInstructions.beneficiaryName || selectedVendor.name,
                bankName: selectedVendor.paymentInstructions.bankName,
                routingNumber: selectedVendor.paymentInstructions.routingNumber,
                accountNumber: selectedVendor.paymentInstructions.accountNumber,
                railPreference: selectedVendor.paymentInstructions.railPreference,
                verificationStatus: selectedVendor.paymentInstructions.verificationStatus,
              }
            : null,
        })
      : null;

    setData((prev) => {
      const onChainTransactionId =
        payload.method === 'digital_asset' && selectedWallet ? `oct-${stamp}` : undefined;
      const digitalAssetUnitPrice =
        selectedDigitalAsset && selectedDigitalAsset.quantity > 0
          ? selectedDigitalAsset.estimatedValue / selectedDigitalAsset.quantity
          : 1;
      const digitalAssetQuantityMoved =
        payload.method === 'digital_asset' && selectedDigitalAsset
          ? Number((amount / Math.max(digitalAssetUnitPrice, 0.00000001)).toFixed(8))
          : undefined;
      const remittanceMode =
        sourceBankAccount && (payload.method === 'ach' || payload.method === 'wire' || payload.method === 'check')
          ? ('bank_backed' as const)
          : ('informational_only' as const);
      const settlementPath: SettlementPath =
        payload.method === 'digital_asset'
          ? selectedTreasuryAccount || resolvedDischargeMethod === 'mixed_discharge'
            ? 'mixed'
            : 'wallet'
          : sourceLedgerAccount && (payload.method === 'ach' || payload.method === 'wire')
          ? 'internal_ledger'
          : resolvedDischargeMethod === 'internal_ledger_credit' && !sourceBankAccount
            ? 'internal_ledger'
          : payload.method === 'wire'
            ? 'wire'
            : payload.method === 'card'
              ? 'card'
              : payload.method === 'cash'
                ? 'cash'
                : 'ach';
      const shouldIssueSettlementToken =
        payload.method === 'digital_asset' ||
        prev.workspaceSettings.digitalAssetVerificationRequired ||
        Boolean(sourceLedgerAccount) ||
        Boolean(selectedTreasuryAccount) ||
        requiresSettlementExecution;
      const settlementToken = shouldIssueSettlementToken
        ? {
            id: `tok-${settlementId}`,
            entityId: entity.id,
            subjectType: 'settlement' as const,
            subjectId: settlementId,
            label: `${payload.direction === 'incoming' ? 'Receipt' : 'Disbursement'} Settlement Token`,
            status:
              settlementExecutionResponse?.execution.verificationStatus === 'verified'
                ? ('verified' as const)
                : ('issued' as const),
            tokenStandard: 'internal-proof',
            tokenReference:
              settlementExecutionResponse?.execution.executionReference || `SET-${stamp}`,
            issuedAt: new Date().toISOString(),
            proofReference:
              settlementExecutionResponse?.execution.executionReason ||
              'Issued automatically during payment posting.',
            notes:
              payload.notes ||
              (selectedTreasuryAccount
                ? `Treasury source: ${selectedTreasuryAccount.name}`
                : sourceLedgerAccount
                ? `Ledger remittance source: ${sourceLedgerAccount.code} ${sourceLedgerAccount.name}`
                : undefined),
          }
        : null;
      const paymentStatus =
        settlementExecutionResponse?.execution.processorStatus === 'blocked'
          ? ('failed' as const)
          : settlementExecutionResponse?.execution.processorStatus === 'settled'
            ? ('settled' as const)
            : settlementExecutionResponse?.execution
              ? ('initiated' as const)
              : requiresWalletExecution
                ? ('initiated' as const)
              : ('settled' as const);
      const settlementStatus =
        settlementExecutionResponse?.execution.processorStatus === 'blocked' ||
        settlementExecutionResponse?.execution.processorStatus === 'requires_review'
          ? ('exception' as const)
          : settlementExecutionResponse?.execution
            ? ('routing' as const)
            : requiresWalletExecution
              ? ('verifying' as const)
            : payload.method === 'digital_asset'
              ? ('settled' as const)
              : ('settled' as const);
      const remittanceCounterpartyName =
        selectedVendor?.name ||
        selectedCustomer?.name ||
        (payload.direction === 'outgoing' ? 'Payee' : 'Payer');
      const digitalLedgerLabel = selectedDigitalLedgerAccount
        ? `${selectedDigitalLedgerAccount.code} ${selectedDigitalLedgerAccount.name}`
        : selectedWallet?.linkedLedgerAccountId || '1610 Digital Asset Treasury';
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
        status: paymentStatus,
        linkedInvoiceIds: payload.linkedInvoiceId ? [payload.linkedInvoiceId] : undefined,
        linkedBillIds: payload.linkedBillId ? [payload.linkedBillId] : undefined,
        linkedTransactionIds: [transactionId],
        linkedSettlementId: settlementId,
        linkedWalletId: selectedWallet?.id,
        linkedDigitalAssetId: selectedDigitalAsset?.id,
        linkedOnChainTransactionId: onChainTransactionId,
        sourceBankAccountId: sourceBankAccount?.id,
        sourceLedgerAccountId: sourceLedgerAccount?.id,
        treasuryAccountId: selectedTreasuryAccount?.id,
        dischargeMethod: resolvedDischargeMethod,
        approvalStatus:
          requiresSettlementExecution || requiresWalletExecution
            ? ('pending' as const)
            : ('not_required' as const),
        releaseStatus:
          requiresSettlementExecution || requiresWalletExecution
            ? ('queued' as const)
            : ('not_applicable' as const),
        releaseTokenId: settlementToken?.id,
        settlementExecution: settlementExecutionResponse
          ? {
              sourceType: settlementExecutionResponse.execution.sourceType,
              executionRail: settlementExecutionResponse.execution.rail,
              processorStatus: settlementExecutionResponse.execution.processorStatus,
              executionReason: settlementExecutionResponse.execution.executionReason,
              executionReference: settlementExecutionResponse.execution.executionReference,
              vendorInstructionVerified:
                settlementExecutionResponse.execution.vendorInstructionVerified,
              simulatedProcessing: settlementExecutionResponse.execution.simulatedProcessing,
            }
          : requiresWalletExecution
            ? {
                sourceType: selectedTreasuryAccount || sourceLedgerAccount ? 'ledger_account' : 'manual_remittance',
                executionRail: 'None',
                processorStatus: 'queued',
                executionReason: 'Wallet settlement is waiting for release and on-chain confirmation.',
                executionReference: onChainTransactionId,
                vendorInstructionVerified: true,
                simulatedProcessing: true,
              }
          : undefined,
        notes:
          payload.notes ||
          settlementExecutionResponse?.execution.executionReason ||
          undefined,
      };
      const nextTransaction = {
        id: transactionId,
        entityId: entity.id,
        type:
          payload.method === 'digital_asset'
            ? payload.direction === 'incoming'
              ? ('token_receipt' as const)
              : ('wallet_transfer' as const)
            : payload.direction === 'incoming'
              ? ('deposit' as const)
              : ('withdrawal' as const),
        title:
          payload.method === 'digital_asset'
            ? payload.direction === 'incoming'
              ? `Digital asset receipt${selectedDigitalAsset?.symbol ? ` (${selectedDigitalAsset.symbol})` : ''}`
              : `Digital asset disbursement${selectedDigitalAsset?.symbol ? ` (${selectedDigitalAsset.symbol})` : ''}`
            : payload.direction === 'incoming'
            ? `Customer receipt${linkedInvoice ? ` for ${linkedInvoice.invoiceNumber}` : ''}`
            : `Vendor payment${linkedBill ? ` for ${linkedBill.billNumber || linkedBill.id}` : ''}`,
        amount,
        currency: nextPayment.currency,
        date: nextPayment.paymentDate,
        status: 'posted' as const,
        linkedAssetIds: selectedDigitalAsset ? [selectedDigitalAsset.id] : undefined,
        linkedWalletId: selectedWallet?.id,
        linkedOnChainRecordId: onChainTransactionId,
        linkedSettlementId: settlementId,
        linkedPaymentIds: [paymentId],
        linkedJournalEntryIds: [journalId],
        linkedTokenIds: settlementToken ? [settlementToken.id] : undefined,
        notes:
          payload.notes ||
          settlementExecutionResponse?.execution.executionReason ||
          undefined,
      };
      const nextOnChainTransaction = onChainTransactionId
        ? {
            id: onChainTransactionId,
            entityId: entity.id,
            walletId: selectedWallet?.id,
            txHash: `0x${Math.random().toString(16).slice(2)}${Math.random()
              .toString(16)
              .slice(2)}`.slice(0, 34),
            network: selectedWallet?.network || selectedDigitalAsset?.network || 'Ethereum',
            eventType: payload.direction === 'incoming' ? ('receive' as const) : ('send' as const),
            assetId: selectedDigitalAsset?.id,
            linkedPaymentId: paymentId,
            linkedSettlementId: settlementId,
            linkedTransactionId: transactionId,
            timestamp: new Date(`${nextPayment.paymentDate}T12:00:00.000Z`).toISOString(),
            feeAmount: Number((amount * 0.0003).toFixed(6)),
            feeAssetSymbol: selectedDigitalAsset?.symbol || selectedWallet?.nativeAssetSymbol || 'ETH',
            status: requiresWalletExecution ? ('pending' as const) : ('confirmed' as const),
          }
        : undefined;
      const nextRemittanceStatement = {
        id: remittanceStatementId,
        entityId: entity.id,
        title:
          payload.direction === 'outgoing'
            ? `Remittance Statement ${paymentId}`
            : `Receipt Advice ${paymentId}`,
        statementDate: nextPayment.paymentDate,
        payerName:
          payload.direction === 'outgoing'
            ? entity.displayName || entity.name
            : remittanceCounterpartyName,
        payeeName:
          payload.direction === 'outgoing'
            ? remittanceCounterpartyName
            : entity.displayName || entity.name,
        amount,
        currency: nextPayment.currency,
        dischargeMethod: resolvedDischargeMethod,
        treasuryAccountId: selectedTreasuryAccount?.id,
        linkedInstrumentSettlementId:
          resolvedDischargeMethod !== 'bank_rail_payment' ? instrumentSettlementId : undefined,
        linkedSettlementId: settlementId,
        micrLine: {
          routingNumber: sourceBankAccount?.routingNumber,
          accountNumberMask: sourceBankAccount?.accountNumber
            ? sourceBankAccount.accountNumber.slice(-4)
            : undefined,
          serialNumber: String(stamp).slice(-6),
          mode: remittanceMode,
        },
        status: paymentStatus === 'settled' ? ('performed' as const) : ('issued' as const),
        notes:
          payload.notes ||
          `Generated from ${payload.method} payment posting with ${resolvedDischargeMethod} discharge.`,
      };
      const nextInstrumentSettlement =
        resolvedDischargeMethod !== 'bank_rail_payment'
          ? {
              id: instrumentSettlementId,
              entityId: entity.id,
              title:
                payload.direction === 'incoming'
                  ? `Performance receipt ${paymentId}`
                  : `Performance remittance ${paymentId}`,
              treasuryAccountId: selectedTreasuryAccount?.id,
              linkedSettlementId: settlementId,
              linkedTransactionId: transactionId,
              linkedTokenIds: settlementToken ? [settlementToken.id] : undefined,
              dischargeMethod: resolvedDischargeMethod,
              recognitionBasis: 'obligation_recognized_before_cash' as const,
              performanceStatus:
                paymentStatus === 'settled' ? ('performed' as const) : ('issued' as const),
              faceAmount: amount,
              performedAmount: paymentStatus === 'settled' ? amount : 0,
              currency: nextPayment.currency,
              effectiveDate: nextPayment.paymentDate,
              dueDate: nextPayment.paymentDate,
              remittanceReference: remittanceStatementId,
              notes:
                payload.notes ||
                'Generated automatically from accounting payment discharge selection.',
            }
          : undefined;
      const nextSettlement = {
        id: settlementId,
        entityId: entity.id,
        linkedTransactionId: transactionId,
        linkedPaymentId: paymentId,
        linkedJournalEntryIds: [journalId],
        linkedOnChainRecordId: onChainTransactionId,
        linkedInstrumentSettlementId: nextInstrumentSettlement?.id,
        linkedRemittanceStatementId: nextRemittanceStatement.id,
        path: settlementPath,
        dischargeMethod: resolvedDischargeMethod,
        direction: payload.direction,
        status: settlementStatus,
        liquidCashStage:
          requiresSettlementExecution
            ? sourceLedgerAccount && payload.direction === 'outgoing'
              ? ('liquid_cash_reserved' as const)
              : ('liquid_cash_pending' as const)
            : requiresWalletExecution
              ? selectedTreasuryAccount
                ? ('liquid_cash_reserved' as const)
                : ('pending_liquidation' as const)
            : payload.method === 'digital_asset'
              ? payload.direction === 'incoming'
                ? ('liquid_cash_available' as const)
                : ('liquid_cash_released' as const)
            : payload.direction === 'incoming'
              ? ('liquid_cash_available' as const)
              : ('liquid_cash_released' as const),
        verificationMethod: settlementExecutionResponse
          ? settlementExecutionResponse.execution.verificationMethod
          : payload.method === 'digital_asset'
            ? ('wallet_confirmation' as const)
            : settlementToken
              ? ('internal_control_token' as const)
              : ('bank_confirmation' as const),
        verificationStatus: settlementExecutionResponse
          ? settlementExecutionResponse.execution.verificationStatus
          : requiresWalletExecution
            ? ('pending' as const)
          : settlementToken || payload.method === 'digital_asset'
            ? ('pending' as const)
            : ('verified' as const),
        verificationReference:
          settlementExecutionResponse?.execution.executionReason ||
          (payload.method === 'digital_asset'
            ? 'Awaiting token or wallet verification.'
            : 'ERP payment posting completed.'),
        tokenizedProofId: settlementToken?.id,
        linkedTokenIds: settlementToken ? [settlementToken.id] : undefined,
        grossAmount: amount,
        settledAmount: amount,
        currency: nextPayment.currency,
        initiatedAt: nextPayment.paymentDate,
        expectedSettlementDate: nextPayment.paymentDate,
        actualSettlementDate:
          paymentStatus === 'settled' ? nextPayment.paymentDate : undefined,
        originSourceType:
          settlementExecutionResponse?.execution.sourceType ||
          (selectedTreasuryAccount || sourceLedgerAccount
            ? ('ledger_account' as const)
            : onChainTransactionId
              ? ('manual_remittance' as const)
              : undefined),
        originSourceId:
          sourceBankAccount?.id ||
          sourceLedgerAccount?.id ||
          selectedTreasuryAccount?.id ||
          selectedWallet?.id,
        executionRail:
          settlementExecutionResponse?.execution.rail ||
          (payload.method === 'digital_asset' ? ('None' as const) : undefined),
        processorStatus:
          settlementExecutionResponse?.execution.processorStatus ||
          (requiresWalletExecution
            ? ('queued' as const)
            : payload.method === 'digital_asset'
              ? ('settled' as const)
              : undefined),
        executionReason:
          settlementExecutionResponse?.execution.executionReason ||
          (requiresWalletExecution
            ? 'Wallet settlement is queued for release and chain confirmation.'
            : payload.method === 'digital_asset'
            ? 'Digital asset settlement posted through connected wallet controls.'
            : undefined),
        executionReference:
          settlementExecutionResponse?.execution.executionReference || nextOnChainTransaction?.txHash,
        reserveBacked:
          selectedTreasuryAccount?.treasuryType === 'reserve' ||
          sourceLedgerAccount?.remittanceClassification === 'reserve',
        autoReconcileStatus:
          settlementStatus === 'exception'
            ? ('exception' as const)
            : prev.workspaceSettings.autoReconcileJournalEntries
              ? ('pending' as const)
              : undefined,
        requiresManualReview:
          payload.method === 'digital_asset' ||
          prev.workspaceSettings.requireDocumentLinksForSettlements ||
          settlementExecutionResponse?.execution.processorStatus === 'requires_review' ||
          settlementExecutionResponse?.execution.processorStatus === 'blocked',
        notes:
          payload.notes ||
          settlementExecutionResponse?.execution.executionReason ||
          undefined,
      };
      const journalMemo =
        payload.method === 'digital_asset'
          ? payload.direction === 'incoming'
            ? `Record digital asset receipt${selectedDigitalAsset?.symbol ? ` in ${selectedDigitalAsset.symbol}` : ''}`
            : `Record digital asset disbursement${selectedDigitalAsset?.symbol ? ` in ${selectedDigitalAsset.symbol}` : ''}`
          : payload.direction === 'incoming'
          ? `Record payment receipt${linkedInvoice ? ` for ${linkedInvoice.invoiceNumber}` : ''}`
          : `Record disbursement${linkedBill ? ` for ${linkedBill.billNumber || linkedBill.id}` : ''}${
              sourceLedgerAccount ? ` from ${sourceLedgerAccount.name}` : ''
            }`;
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
          payload.method === 'digital_asset'
            ? payload.direction === 'incoming'
              ? digitalLedgerLabel
              : linkedBill
                ? '2000 Accounts Payable'
                : '6105 Digital Asset Disbursements'
            : payload.direction === 'incoming'
            ? '1000 Operating Cash'
            : linkedBill
              ? '2000 Accounts Payable'
              : '6100 Disbursements',
        creditAccount:
          payload.method === 'digital_asset'
            ? payload.direction === 'incoming'
              ? linkedInvoice
                ? '1100 Accounts Receivable'
                : '2405 Digital Asset Clearing'
              : digitalLedgerLabel
            : payload.direction === 'incoming'
            ? linkedInvoice
              ? '1100 Accounts Receivable'
              : '2300 Unapplied Cash'
            : sourceLedgerAccount
              ? `${sourceLedgerAccount.code} ${sourceLedgerAccount.name}`
              : selectedTreasuryAccount
                ? selectedTreasuryAccount.name
              : '1000 Operating Cash',
        amount,
        status: 'posted' as const,
        source: 'system' as const,
        linkedTransactionIds: [transactionId],
        linkedSettlementIds: [settlementId],
        autoReconcileStatus:
          (entity.operationalDefaults?.autoReconcileLedgerLinks ??
            prev.workspaceSettings.autoReconcileJournalEntries)
            ? (settlementStatus === 'exception' ? ('exception' as const) : ('pending' as const))
            : undefined,
        verificationRequired:
          prev.workspaceSettings.requireDocumentLinksForSettlements ||
          Boolean(settlementExecutionResponse) ||
          Boolean(sourceLedgerAccount),
      };

      const nextInvoices = linkedInvoice
        ? prev.invoices.map((invoice) =>
            invoice.id === linkedInvoice.id
              ? {
                  ...invoice,
                  balanceDue: Math.max(0, invoice.balanceDue - amount),
                  status:
                    invoice.balanceDue - amount <= 0 ? 'paid' : 'partially_paid',
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
                    bill.balanceDue - amount <= 0 ? 'paid' : 'partially_paid',
                  linkedPaymentIds: [paymentId, ...(bill.linkedPaymentIds ?? [])],
                  linkedTransactionIds: [transactionId, ...(bill.linkedTransactionIds ?? [])],
                }
              : bill
          )
        : prev.bills;

      const nextBankAccounts = sourceBankAccount
        ? prev.bankAccounts.map((account) =>
            account.id === sourceBankAccount.id
              ? {
                  ...account,
                  currentBalance: resolveLedgerBalance(
                    account.currentBalance ?? 0,
                    payload.direction,
                    amount
                  ),
                }
              : account
          )
        : prev.bankAccounts;

      const shouldApplyDigitalMovementImmediately =
        payload.method === 'digital_asset' && (!requiresWalletExecution || payload.direction === 'incoming');

      const nextLedgerAccounts = prev.ledgerAccounts.map((account) => {
        if (sourceLedgerAccount && account.id === sourceLedgerAccount.id) {
          return {
            ...account,
            balance: resolveLedgerBalance(account.balance, payload.direction, amount),
          };
        }

        if (
          shouldApplyDigitalMovementImmediately &&
          selectedDigitalLedgerAccount &&
          account.id === selectedDigitalLedgerAccount.id &&
          account.id !== sourceLedgerAccount?.id
        ) {
          return {
            ...account,
            balance: resolveLedgerBalance(account.balance, payload.direction, amount),
          };
        }

        return account;
      });

      const nextTreasuryAccounts = selectedTreasuryAccount
        ? prev.treasuryAccounts.map((account) => {
            if (account.id !== selectedTreasuryAccount.id) {
              return account;
            }

            const nextAvailable =
              payload.direction === 'incoming'
                ? account.availableBalance + amount
                : paymentStatus === 'settled'
                  ? account.availableBalance - amount
                  : account.availableBalance - amount;
            const nextReserved =
              payload.direction === 'outgoing' && paymentStatus !== 'settled'
                ? (account.reservedBalance ?? 0) + amount
                : account.reservedBalance;

            return {
              ...account,
              availableBalance: Number(nextAvailable.toFixed(2)),
              reservedBalance:
                nextReserved !== undefined ? Number(nextReserved.toFixed(2)) : nextReserved,
            };
          })
        : prev.treasuryAccounts;

      const nextWallets = selectedWallet
        ? prev.wallets.map((wallet) =>
            wallet.id === selectedWallet.id
              ? {
                  ...wallet,
                  connectionStatus: 'connected',
                  lastSyncAt: new Date().toISOString(),
                  linkedTreasuryAccountId:
                    wallet.linkedTreasuryAccountId || selectedTreasuryAccount?.id,
                }
              : wallet
          )
        : prev.wallets;

      const nextDigitalAssets = selectedDigitalAsset
        ? prev.digitalAssets.map((asset) => {
            if (
              asset.id !== selectedDigitalAsset.id ||
              !digitalAssetQuantityMoved ||
              !shouldApplyDigitalMovementImmediately
            ) {
              return asset;
            }

            const nextQuantity = Math.max(
              0,
              asset.quantity +
                (payload.direction === 'incoming'
                  ? digitalAssetQuantityMoved
                  : -digitalAssetQuantityMoved)
            );
            const nextEstimatedValue = Math.max(
              0,
              asset.estimatedValue + (payload.direction === 'incoming' ? amount : -amount)
            );

            return {
              ...asset,
              walletId: selectedWallet?.id || asset.walletId,
              quantity: Number(nextQuantity.toFixed(8)),
              estimatedValue: Number(nextEstimatedValue.toFixed(2)),
            };
          })
        : prev.digitalAssets;

      return {
        ...prev,
        entities: prev.entities.map((item) =>
          item.id === entity.id ? incrementEntitySequence(item, 'journal') : item
        ),
        invoices: nextInvoices,
        bills: nextBills,
        payments: [nextPayment, ...(prev.payments ?? [])],
        bankAccounts: nextBankAccounts,
        ledgerAccounts: nextLedgerAccounts,
        treasuryAccounts: nextTreasuryAccounts,
        wallets: nextWallets,
        digitalAssets: nextDigitalAssets,
        transactions: [nextTransaction, ...(prev.transactions ?? [])],
        settlements: [nextSettlement, ...(prev.settlements ?? [])],
        remittanceStatements: [nextRemittanceStatement, ...(prev.remittanceStatements ?? [])],
        instrumentSettlements: nextInstrumentSettlement
          ? [nextInstrumentSettlement, ...(prev.instrumentSettlements ?? [])]
          : prev.instrumentSettlements,
        onChainTransactions: nextOnChainTransaction
          ? [nextOnChainTransaction, ...(prev.onChainTransactions ?? [])]
          : prev.onChainTransactions,
        journalEntries: [nextJournal, ...(prev.journalEntries ?? [])],
        tokens: settlementToken ? [settlementToken, ...(prev.tokens ?? [])] : prev.tokens,
      };
    });

    setActiveSubsection('payments');
    setIsPaymentModalOpen(false);
  };

  const handleApproveOutgoingPayment = (paymentId: string) => {
    const approvalAt = new Date().toISOString();
    const approver =
      defaultEntity?.representativeName ||
      defaultEntity?.displayName ||
      data.workspaceSettings.workspaceName ||
      'ClearFlow Operator';

    setData((prev) => {
      const payment = prev.payments.find((item) => item.id === paymentId);
      if (!payment) {
        return prev;
      }

      const settlement = payment.linkedSettlementId
        ? prev.settlements.find((item) => item.id === payment.linkedSettlementId)
        : undefined;

      if (
        payment.direction !== 'outgoing' ||
        payment.counterpartyType !== 'vendor' ||
        (payment.method !== 'ach' && payment.method !== 'wire' && payment.method !== 'digital_asset') ||
        settlement?.processorStatus === 'requires_review' ||
        settlement?.processorStatus === 'blocked'
      ) {
        return prev;
      }

      const linkedTokenIds = settlement?.linkedTokenIds || (payment.releaseTokenId ? [payment.releaseTokenId] : []);
      const tokenShouldVerify = settlement?.verificationMethod === 'internal_control_token';

      return {
        ...prev,
        payments: prev.payments.map((item) =>
          item.id === paymentId
            ? {
                ...item,
                approvalStatus: 'approved',
                approvedBy: approver,
                approvedAt: approvalAt,
                releaseStatus: item.releaseStatus === 'released' ? 'released' : 'ready_to_release',
                notes: item.notes || 'Approved for remittance release.',
              }
            : item
        ),
        settlements: prev.settlements.map((item) =>
          item.id === payment.linkedSettlementId
            ? {
                ...item,
                status:
                  item.status === 'exception'
                    ? item.status
                    : payment.method === 'digital_asset'
                      ? ('verifying' as const)
                      : ('verifying' as const),
                verificationStatus: tokenShouldVerify ? 'verified' : item.verificationStatus,
                verificationReference: tokenShouldVerify
                  ? `Internal control token approved by ${approver}.`
                  : item.verificationReference,
              }
            : item
        ),
        tokens: prev.tokens.map((token) =>
          linkedTokenIds.includes(token.id) && tokenShouldVerify
            ? {
                ...token,
                status: 'verified',
                verifiedAt: approvalAt,
                proofReference:
                  token.proofReference ||
                  `Approved for remittance release by ${approver}.`,
              }
            : token
        ),
      };
    });
  };

  const handleReleaseOutgoingPayment = async (paymentId: string) => {
    const releasedAt = new Date().toISOString();
    const releaser =
      defaultEntity?.representativeName ||
      defaultEntity?.displayName ||
      data.workspaceSettings.workspaceName ||
      'ClearFlow Operator';
    const livePayment = data.payments.find((item) => item.id === paymentId);
    const liveWallet = livePayment?.linkedWalletId
      ? data.wallets.find((item) => item.id === livePayment.linkedWalletId)
      : undefined;
    const liveVendor =
      livePayment?.counterpartyType === 'vendor' && livePayment.counterpartyId
        ? data.vendors.find((item) => item.id === livePayment.counterpartyId)
        : undefined;
    const liveDigitalAsset = livePayment?.linkedDigitalAssetId
      ? data.digitalAssets.find((item) => item.id === livePayment.linkedDigitalAssetId)
      : undefined;
    let walletExecution:
      | {
          txHash: string;
          destinationAddress: string;
          executionMode: 'injected_wallet';
          transferKind: 'native_transfer' | 'erc20_transfer';
          assetAmount: number;
          rawUnits?: string;
          contractAddress?: string;
          assetSymbol?: string;
        }
      | undefined;

    if (livePayment?.method === 'digital_asset' && liveWallet && liveVendor) {
      if (canUseInjectedWalletExecution(liveWallet, liveVendor)) {
        try {
          walletExecution = await executeInjectedWalletPayment({
            wallet: liveWallet,
            vendor: liveVendor,
            asset: liveDigitalAsset,
            amountFiat: livePayment.amount,
          });
          setOperationsNotice(
            walletExecution.transferKind === 'erc20_transfer'
              ? `Token transfer broadcast from ${liveWallet.name}${walletExecution.assetSymbol ? ` using ${walletExecution.assetSymbol}` : ''}. Hash: ${walletExecution.txHash}`
              : `Wallet transaction broadcast from ${liveWallet.name}. Hash: ${walletExecution.txHash}`
          );
        } catch (error) {
          setOperationsNotice(
            error instanceof Error
              ? `${error.message} Release stayed in controlled queue.`
              : 'Wallet broadcast failed, so the payment stayed in controlled queue.'
          );
        }
      } else if (!liveVendor.paymentInstructions?.digitalWalletAddress) {
        setOperationsNotice(
          `Vendor ${liveVendor.name} does not have a digital wallet address on file yet, so release stayed in controlled queue mode.`
        );
      } else {
        setOperationsNotice(
          'Injected-wallet broadcast is not available for this wallet/network, so release stayed in controlled queue mode.'
        );
      }
    }

    setData((prev) => {
      const payment = prev.payments.find((item) => item.id === paymentId);
      if (!payment) {
        return prev;
      }

      const settlement = payment.linkedSettlementId
        ? prev.settlements.find((item) => item.id === payment.linkedSettlementId)
        : undefined;

      if (
        payment.direction !== 'outgoing' ||
        payment.counterpartyType !== 'vendor' ||
        (payment.method !== 'ach' && payment.method !== 'wire' && payment.method !== 'digital_asset') ||
        payment.releaseStatus === 'released' ||
        (payment.approvalStatus !== 'approved' && payment.approvalStatus !== 'not_required') ||
        settlement?.processorStatus === 'requires_review' ||
        settlement?.processorStatus === 'blocked'
      ) {
        return prev;
      }

      const linkedTokenIds = settlement?.linkedTokenIds || (payment.releaseTokenId ? [payment.releaseTokenId] : []);
      const treasuryAccount = payment.treasuryAccountId
        ? prev.treasuryAccounts.find((account) => account.id === payment.treasuryAccountId)
        : undefined;

      return {
        ...prev,
        payments: prev.payments.map((item) =>
          item.id === paymentId
            ? {
                ...item,
                status: payment.method === 'digital_asset' ? 'initiated' : 'settled',
                releaseStatus: 'released',
                releasedBy: releaser,
                releasedAt,
                approvalStatus: item.approvalStatus || 'approved',
                settlementExecution:
                  item.method === 'digital_asset' && item.settlementExecution
                    ? {
                        ...item.settlementExecution,
                        processorStatus: walletExecution ? 'processing' : item.settlementExecution.processorStatus,
                        executionReason: walletExecution
                          ? walletExecution.transferKind === 'erc20_transfer'
                            ? `Broadcast token transfer through injected wallet control to ${walletExecution.destinationAddress}${walletExecution.assetSymbol ? ` using ${walletExecution.assetSymbol}` : ''}.`
                            : `Broadcast through injected wallet control to ${walletExecution.destinationAddress}.`
                          : item.settlementExecution.executionReason,
                        executionReference: walletExecution?.txHash || item.settlementExecution.executionReference,
                        simulatedProcessing: walletExecution ? false : item.settlementExecution.simulatedProcessing,
                      }
                    : item.settlementExecution,
              }
            : item
        ),
        settlements: prev.settlements.map((item) =>
          item.id === payment.linkedSettlementId
            ? {
                ...item,
                status: payment.method === 'digital_asset' ? 'clearing' : 'settled',
                processorStatus: payment.method === 'digital_asset' ? 'processing' : 'settled',
                releasedAt,
                releasedBy: releaser,
                actualSettlementDate:
                  payment.method === 'digital_asset' ? item.actualSettlementDate : releasedAt.slice(0, 10),
                liquidCashStage:
                  payment.method === 'digital_asset' ? 'pending_liquidation' : 'liquid_cash_released',
                verificationStatus: payment.method === 'digital_asset' ? 'pending' : 'verified',
                verificationReference:
                  payment.method === 'digital_asset'
                    ? walletExecution
                      ? walletExecution.transferKind === 'erc20_transfer'
                        ? `Released by ${releaser}. Token transfer broadcast on-chain and waiting for confirmation.`
                        : `Released by ${releaser}. Broadcast on-chain and waiting for confirmation.`
                      : `Released by ${releaser} and waiting for on-chain confirmation.`
                    : `Released by ${releaser} through the remittance control desk.`,
                executionReference: walletExecution?.txHash || item.executionReference,
                autoReconcileStatus: payment.method === 'digital_asset' ? item.autoReconcileStatus : 'pending',
              }
            : item
        ),
        onChainTransactions: prev.onChainTransactions.map((item) =>
          item.id === payment.linkedOnChainTransactionId
            ? {
                ...item,
                txHash: walletExecution?.txHash || item.txHash,
                status: 'pending',
              }
            : item
        ),
        remittanceStatements: prev.remittanceStatements.map((item) =>
          settlement?.linkedRemittanceStatementId && item.id === settlement.linkedRemittanceStatementId
            ? {
                ...item,
                status: payment.method === 'digital_asset' ? 'accepted' : 'performed',
              }
            : item
        ),
        instrumentSettlements: prev.instrumentSettlements.map((item) =>
          settlement?.linkedInstrumentSettlementId && item.id === settlement.linkedInstrumentSettlementId
            ? {
                ...item,
                performanceStatus:
                  payment.method === 'digital_asset' ? 'presented' : 'performed',
                performedAmount:
                  payment.method === 'digital_asset' ? item.performedAmount : payment.amount,
              }
            : item
        ),
        treasuryAccounts: treasuryAccount
          ? prev.treasuryAccounts.map((account) =>
              account.id === treasuryAccount.id
                ? {
                    ...account,
                    reservedBalance: Number(
                      Math.max(0, (account.reservedBalance ?? 0) - payment.amount).toFixed(2)
                    ),
                  }
                : account
            )
          : prev.treasuryAccounts,
        tokens: prev.tokens.map((token) =>
          linkedTokenIds.includes(token.id)
            ? {
                ...token,
                status: 'verified',
                verifiedAt: releasedAt,
                proofReference:
                  token.proofReference ||
                  `Released by ${releaser} through the remittance control desk.`,
              }
            : token
        ),
      };
    });
  };

  const handleConfirmWalletSettlement = async (
    paymentId: string,
    options?: {
      allowManualFallback?: boolean;
      silentPending?: boolean;
    }
  ) => {
    const allowManualFallback = options?.allowManualFallback ?? true;
    const silentPending = options?.silentPending ?? false;
    const confirmedAt = new Date().toISOString();
    const confirmer =
      defaultEntity?.representativeName ||
      defaultEntity?.displayName ||
      data.workspaceSettings.workspaceName ||
      'ClearFlow Operator';
    const livePayment = data.payments.find((item) => item.id === paymentId);
    const liveWallet = livePayment?.linkedWalletId
      ? data.wallets.find((item) => item.id === livePayment.linkedWalletId)
      : undefined;
    const liveOnChain = livePayment?.linkedOnChainTransactionId
      ? data.onChainTransactions.find((item) => item.id === livePayment.linkedOnChainTransactionId)
      : undefined;

    if (livePayment?.method === 'digital_asset' && liveWallet && liveOnChain?.txHash) {
      const pollResult = await pollInjectedWalletTransaction(liveOnChain.txHash);
      if (pollResult.status === 'pending') {
        if (!silentPending) {
          setOperationsNotice(
            `Wallet transaction ${liveOnChain.txHash} is still pending on ${liveWallet.network}.`
          );
        }
        return;
      }

      if (pollResult.status === 'failed') {
        setData((prev) => ({
          ...prev,
          payments: prev.payments.map((item) =>
            item.id === paymentId ? { ...item, status: 'failed' } : item
          ),
          settlements: prev.settlements.map((item) =>
            item.id === livePayment.linkedSettlementId
              ? {
                  ...item,
                  status: 'exception',
                  processorStatus: 'blocked',
                  verificationStatus: 'exception',
                  verificationReference: `On-chain execution failed for ${liveOnChain.txHash}.`,
                  autoReconcileStatus: 'exception',
                }
              : item
          ),
          onChainTransactions: prev.onChainTransactions.map((item) =>
            item.id === liveOnChain.id ? { ...item, status: 'failed' } : item
          ),
        }));
        setOperationsNotice(`Wallet transaction ${liveOnChain.txHash} failed on-chain.`);
        return;
      }

      if (pollResult.status === 'provider_unavailable') {
        if (!allowManualFallback) {
          return;
        }

        setOperationsNotice(
          'Live wallet receipt polling is temporarily unavailable, so a controlled manual confirmation is being applied.'
        );
      } else {
        setOperationsNotice(`Wallet transaction ${liveOnChain.txHash} confirmed on-chain.`);
      }
    } else if (livePayment?.method === 'digital_asset') {
      if (!allowManualFallback) {
        return;
      }

      setOperationsNotice(
        'Manual confirmation applied because live provider receipt polling was not available for this wallet.'
      );
    }

    setData((prev) => {
      const payment = prev.payments.find((item) => item.id === paymentId);
      if (
        !payment ||
        payment.direction !== 'outgoing' ||
        payment.counterpartyType !== 'vendor' ||
        payment.method !== 'digital_asset' ||
        payment.releaseStatus !== 'released'
      ) {
        return prev;
      }

      const settlement = payment.linkedSettlementId
        ? prev.settlements.find((item) => item.id === payment.linkedSettlementId)
        : undefined;
      const digitalAsset = payment.linkedDigitalAssetId
        ? prev.digitalAssets.find((item) => item.id === payment.linkedDigitalAssetId)
        : undefined;
      const linkedLedgerAccount = digitalAsset?.linkedLedgerAccountId
        ? prev.ledgerAccounts.find((item) => item.id === digitalAsset.linkedLedgerAccountId)
        : undefined;
      const quantityDelta =
        digitalAsset && digitalAsset.quantity > 0 && digitalAsset.estimatedValue > 0
          ? Number((payment.amount / (digitalAsset.estimatedValue / digitalAsset.quantity)).toFixed(8))
          : 0;
      const linkedTokenIds = settlement?.linkedTokenIds || (payment.releaseTokenId ? [payment.releaseTokenId] : []);

      return {
        ...prev,
        payments: prev.payments.map((item) =>
          item.id === paymentId
            ? {
                ...item,
                status: 'settled',
                settlementExecution:
                  item.settlementExecution
                    ? {
                        ...item.settlementExecution,
                        processorStatus: 'settled',
                        executionReason:
                          item.settlementExecution.executionReason ||
                          `Confirmed on-chain by ${confirmer}.`,
                      }
                    : item.settlementExecution,
              }
            : item
        ),
        settlements: prev.settlements.map((item) =>
          item.id === payment.linkedSettlementId
            ? {
                ...item,
                status: 'settled',
                processorStatus: 'settled',
                actualSettlementDate: confirmedAt.slice(0, 10),
                liquidCashStage: 'liquid_cash_released',
                verificationStatus: 'verified',
                verificationReference: `On-chain settlement confirmed by ${confirmer}.`,
                autoReconcileStatus: 'pending',
              }
            : item
        ),
        onChainTransactions: prev.onChainTransactions.map((item) =>
          item.id === payment.linkedOnChainTransactionId
            ? {
                ...item,
                status: 'confirmed',
              }
            : item
        ),
        digitalAssets: digitalAsset
          ? prev.digitalAssets.map((item) =>
              item.id === digitalAsset.id
                ? {
                    ...item,
                    quantity: Number(Math.max(0, item.quantity - quantityDelta).toFixed(8)),
                    estimatedValue: Number(Math.max(0, item.estimatedValue - payment.amount).toFixed(2)),
                  }
                : item
            )
          : prev.digitalAssets,
        ledgerAccounts: linkedLedgerAccount
          ? prev.ledgerAccounts.map((item) =>
              item.id === linkedLedgerAccount.id
                ? {
                    ...item,
                    balance: Number((item.balance - payment.amount).toFixed(2)),
                  }
                : item
            )
          : prev.ledgerAccounts,
        remittanceStatements: prev.remittanceStatements.map((item) =>
          settlement?.linkedRemittanceStatementId && item.id === settlement.linkedRemittanceStatementId
            ? {
                ...item,
                status: 'performed',
              }
            : item
        ),
        instrumentSettlements: prev.instrumentSettlements.map((item) =>
          settlement?.linkedInstrumentSettlementId && item.id === settlement.linkedInstrumentSettlementId
            ? {
                ...item,
                performanceStatus: 'performed',
                performedAmount: payment.amount,
              }
            : item
        ),
        tokens: prev.tokens.map((token) =>
          linkedTokenIds.includes(token.id)
            ? {
                ...token,
                status: 'verified',
                verifiedAt: confirmedAt,
                proofReference:
                  token.proofReference || `On-chain settlement confirmed by ${confirmer}.`,
              }
            : token
        ),
      };
    });
  };

  useEffect(() => {
    const pendingWalletPayments = data.payments.filter(
      (payment) =>
        payment.method === 'digital_asset' &&
        payment.direction === 'outgoing' &&
        payment.releaseStatus === 'released' &&
        payment.status !== 'settled' &&
        Boolean(payment.linkedOnChainTransactionId) &&
        Boolean(
          payment.linkedOnChainTransactionId &&
            data.onChainTransactions.find(
              (record) =>
                record.id === payment.linkedOnChainTransactionId &&
                record.status === 'pending' &&
                record.txHash
            )
        )
    );

    if (!pendingWalletPayments.length || typeof window === 'undefined') {
      return;
    }

    let isCancelled = false;

    const pollPendingWalletSettlements = async () => {
      for (const payment of pendingWalletPayments) {
        if (isCancelled) {
          return;
        }

        await handleConfirmWalletSettlement(payment.id, {
          allowManualFallback: false,
          silentPending: true,
        });
      }
    };

    void pollPendingWalletSettlements();
    const intervalId = window.setInterval(() => {
      void pollPendingWalletSettlements();
    }, 25000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [data.onChainTransactions, data.payments]);

  const handleOpenBankConnection = (bankAccountId: string) => {
    setSelectedBankFeedAccountId(bankAccountId);
    setIsPlaidModalOpen(true);
  };

  const handlePlaidConnected = (payload: PlaidConnectionPayload) => {
    if (!selectedBankFeedAccountId) {
      setIsPlaidModalOpen(false);
      return;
    }

    setData((prev) => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((account) =>
        account.id === selectedBankFeedAccountId
          ? {
              ...account,
              connectionType: 'plaid_connected',
              liveFeedEnabled: true,
              liveFeedStatus: 'connected',
              liveConnectionProvider: 'plaid',
              plaidItemId: payload.itemId,
              last4:
                payload.authResponse.numbers.ach?.[0]?.account?.slice(-4) || account.last4,
              achOriginationEnabled: account.achOriginationEnabled ?? true,
              autoReconcileEnabled: account.autoReconcileEnabled ?? true,
              onboardingStatus:
                account.onboardingStatus === 'connected'
                  ? 'connected'
                  : ('connected' as const),
            }
          : account
      ),
    }));

    setIsPlaidModalOpen(false);
    setSelectedBankFeedAccountId(null);
    setActiveSubsection('bankFeed');
  };

  const handleCreateBankFeedRule = (payload: BankFeedRuleSubmitPayload) => {
    const entity = defaultEntity;
    if (!entity || !payload.bankAccountId || !payload.name.trim() || !payload.merchantContains.trim()) {
      return;
    }

    setData((prev) => ({
      ...prev,
      bankFeedRules: [
        {
          id: `bfr-${Date.now()}`,
          entityId: entity.id,
          bankAccountId: payload.bankAccountId,
          name: payload.name.trim(),
          merchantContains: payload.merchantContains.trim(),
          direction: payload.direction,
          transactionType: payload.transactionType,
          defaultLedgerAccountId: payload.defaultLedgerAccountId || undefined,
          counterpartyLabel: payload.counterpartyLabel?.trim() || undefined,
          memoTemplate: payload.memoTemplate?.trim() || undefined,
          minAmount: payload.minAmount ? Number(payload.minAmount) : undefined,
          maxAmount: payload.maxAmount ? Number(payload.maxAmount) : undefined,
          verificationMode: payload.verificationMode,
          autoPost: payload.autoPost,
          autoReconcile: payload.autoReconcile,
          active: true,
        },
        ...(prev.bankFeedRules ?? []),
      ],
    }));
  };

  const handleToggleBankFeedRule = (ruleId: string) => {
    setData((prev) => ({
      ...prev,
      bankFeedRules: prev.bankFeedRules.map((rule) =>
        rule.id === ruleId ? { ...rule, active: !rule.active } : rule
      ),
    }));
  };

  const handleSyncBankFeed = async (bankAccountId: string) => {
    setData((prev) => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((account) =>
        account.id === bankAccountId
          ? { ...account, liveFeedStatus: 'syncing', liveFeedEnabled: true }
          : account
      ),
    }));

    const bankAccount = bankAccounts.find((account) => account.id === bankAccountId);
    if (!bankAccount) {
      return;
    }

    let syncedTransactions = [] as Awaited<ReturnType<typeof plaidService.syncTransactions>>;

    try {
      if (bankAccount.connectionType === 'plaid_connected') {
        syncedTransactions = await plaidService.syncTransactions(
          bankAccount.plaidItemId || bankAccount.id
        );
      }
    } catch (error) {
      console.warn('Bank feed sync fell back to local simulation.', error);
    }

    setData((prev) => syncBankFeedToLedger({
      data: prev,
      bankAccountId,
      plaidTransactions: syncedTransactions,
    }));
    setActiveSubsection('bankFeed');
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
          <RemittanceOperationsWorkspace
            payments={payments}
            customers={customers}
            vendors={vendors}
            bankAccounts={defaultEntity ? bankAccounts.filter((item) => item.entityId === defaultEntity.id) : bankAccounts}
            ledgerAccounts={defaultEntity ? ledgerAccounts.filter((item) => item.entityId === defaultEntity.id) : ledgerAccounts}
            treasuryAccounts={
              defaultEntity
                ? treasuryAccounts.filter((item) => item.entityId === defaultEntity.id)
                : treasuryAccounts
            }
            wallets={defaultEntity ? wallets.filter((item) => item.entityId === defaultEntity.id) : wallets}
            onChainTransactions={
              defaultEntity
                ? data.onChainTransactions.filter((item) => item.entityId === defaultEntity.id)
                : data.onChainTransactions
            }
            onApprovePayment={handleApproveOutgoingPayment}
            onReleasePayment={handleReleaseOutgoingPayment}
            onConfirmWalletSettlement={handleConfirmWalletSettlement}
            operationsNotice={operationsNotice}
          />
        );

      case 'bankFeed':
        return (
          <PageSection
            title="Live Bank Feed"
            description="Connect bank accounts, set merchant rules, and post live statement activity into the operational ledger with auto-reconcile controls."
          >
            <BankFeedWorkspace
              bankAccounts={
                defaultEntity
                  ? bankAccounts.filter((item) => item.entityId === defaultEntity.id)
                  : bankAccounts
              }
              ledgerAccounts={
                defaultEntity
                  ? ledgerAccounts.filter((item) => item.entityId === defaultEntity.id)
                  : ledgerAccounts
              }
              rules={
                defaultEntity
                  ? bankFeedRules.filter((rule) => rule.entityId === defaultEntity.id)
                  : bankFeedRules
              }
              entries={
                defaultEntity
                  ? bankFeedEntries.filter((entry) => entry.entityId === defaultEntity.id)
                  : bankFeedEntries
              }
              onConnectBank={handleOpenBankConnection}
              onSyncBank={handleSyncBankFeed}
              onAddRule={handleCreateBankFeedRule}
              onToggleRule={handleToggleBankFeedRule}
            />
          </PageSection>
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
        bankAccounts={defaultEntity ? bankAccounts.filter((item) => item.entityId === defaultEntity.id) : bankAccounts}
        ledgerAccounts={defaultEntity ? ledgerAccounts.filter((item) => item.entityId === defaultEntity.id) : ledgerAccounts}
        treasuryAccounts={
          defaultEntity
            ? treasuryAccounts.filter((item) => item.entityId === defaultEntity.id)
            : treasuryAccounts
        }
        wallets={defaultEntity ? wallets.filter((item) => item.entityId === defaultEntity.id) : wallets}
        digitalAssets={
          defaultEntity
            ? digitalAssets.filter((item) => item.entityId === defaultEntity.id)
            : digitalAssets
        }
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
      {isPlaidModalOpen ? (
        <PlaidLinkModal
          onClose={() => {
            setIsPlaidModalOpen(false);
            setSelectedBankFeedAccountId(null);
          }}
          onConnected={handlePlaidConnected}
        />
      ) : null}

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
              onManageBankFeed={() => setActiveSubsection('bankFeed')}
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
