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
  buildInvoicePacketHtml,
  buildInvoicePacketFileName,
  downloadInvoicePacket,
  openInvoiceEmailDraft,
  resolveInvoiceRecipientEmail,
} from '../../services/invoiceDelivery.service';
import { buildReconciliationCloseMetrics } from '../../services/reconciliationControls.service';
import { parseStatementFileForReconciliation } from '../../services/reconciliationStatement.service';
import {
  getRemittanceRailControl,
  hasHardRailBlocks,
  buildRemittanceRailControls,
} from '../../services/settlementRailing.service';
import { syncBankFeedToLedger } from '../../services/bankFeed.service';
import { plaidService } from '../../services/plaid.service';
import { executeSettlementProcessing } from '../../services/settlementExecution.service';
import {
  canUseInjectedWalletExecution,
  executeInjectedWalletPayment,
  pollInjectedWalletTransaction,
} from '../../services/walletExecution.service';
import { useAuth } from '../../hooks/useAuth';
import AccountingDashboardSection from '../accounting/AccountingDashboardSection';
import AccountingToolbar from '../accounting/AccountingToolbar';
import BankAccountManualModal from '../accounting/BankAccountManualModal';
import BankFeedWorkspace from '../accounting/BankFeedWorkspace';
import BillIntakeModal from '../accounting/BillIntakeModal';
import CouponPresentmentModal from '../accounting/CouponPresentmentModal';
import CounterpartyModal from '../accounting/CounterpartyModal';
import DirectDepositRequestModal from '../accounting/DirectDepositRequestModal';
import EditableRecordSection from '../accounting/EditableRecordSection';
import EmployeeModal from '../accounting/EmployeeModal';
import InterEntityTransferModal from '../accounting/InterEntityTransferModal';
import InvoiceOperationsWorkspace from '../accounting/InvoiceOperationsWorkspace';
import InvoiceQuickAddModal from '../accounting/InvoiceQuickAddModal';
import JournalEntryModal from '../accounting/JournalEntryModal';
import ManualBankTransactionModal from '../accounting/ManualBankTransactionModal';
import PaymentRecordModal from '../accounting/PaymentRecordModal';
import PayrollWorkspace from '../accounting/PayrollWorkspace';
import QuoteBuilderModal from '../accounting/QuoteBuilderModal';
import ReconciliationWorkspace from '../accounting/ReconciliationWorkspace';
import RecurringCommitmentsWorkspace from '../accounting/RecurringCommitmentsWorkspace';
import RemittanceOperationsWorkspace from '../accounting/RemittanceOperationsWorkspace';
import ReceiptIntakeModal from '../accounting/ReceiptIntakeModal';
import { PlaidLinkModal } from '../plaid-link-modal/PlaidLinkModal';
import type {
  AccountingSection,
  BankFeedRuleSubmitPayload,
  BillSubmitPayload,
  CouponPresentmentSubmitPayload,
  CounterpartySubmitPayload,
  DirectDepositRequestSubmitPayload,
  EmployeeSubmitPayload,
  InterEntityTransferSubmitPayload,
  InvoiceSubmitPayload,
  JournalSubmitPayload,
  ManualBankAccountSubmitPayload,
  ManualBankTransactionSubmitPayload,
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

function parseAccountingSubsectionHash(hashValue: string): AccountingSection | null {
  if (!hashValue.startsWith('#accounting:')) {
    return null;
  }

  const normalized = hashValue.replace('#accounting:', '');
  return subnavItems.some((item) => item.id === normalized)
    ? (normalized as AccountingSection)
    : null;
}

type AccountingHashAction =
  | 'new-customer'
  | 'new-vendor'
  | 'new-employee'
  | 'new-invoice'
  | 'new-payment'
  | 'new-direct-deposit'
  | 'new-journal'
  | 'new-bill'
  | 'new-receipt'
  | 'new-presentment'
  | 'new-quote'
  | 'new-intercompany'
  | 'new-bank-account'
  | 'new-bank-transaction';

function parseAccountingActionHash(hashValue: string): AccountingHashAction | null {
  if (!hashValue.startsWith('#accounting:')) {
    return null;
  }

  const normalized = hashValue.replace('#accounting:', '');
  const actions: AccountingHashAction[] = [
    'new-customer',
    'new-vendor',
    'new-employee',
    'new-invoice',
    'new-payment',
    'new-direct-deposit',
    'new-journal',
    'new-bill',
    'new-receipt',
    'new-presentment',
    'new-quote',
    'new-intercompany',
    'new-bank-account',
    'new-bank-transaction',
  ];

  return actions.includes(normalized as AccountingHashAction)
    ? (normalized as AccountingHashAction)
    : null;
}

export default function AccountingPage({ data, setData }: AccountingPageProps) {
  const auth = useAuth();
  const [activeSubsection, setActiveSubsection] =
    useState<AccountingSection>('dashboard');
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isCouponPresentmentModalOpen, setIsCouponPresentmentModalOpen] = useState(false);
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isIntercompanyModalOpen, setIsIntercompanyModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isPlaidModalOpen, setIsPlaidModalOpen] = useState(false);
  const [isManualBankAccountModalOpen, setIsManualBankAccountModalOpen] = useState(false);
  const [isManualBankTransactionModalOpen, setIsManualBankTransactionModalOpen] = useState(false);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isDirectDepositModalOpen, setIsDirectDepositModalOpen] = useState(false);
  const [selectedBankFeedAccountId, setSelectedBankFeedAccountId] = useState<string | null>(null);
  const [counterpartyModalMode, setCounterpartyModalMode] =
    useState<'customer' | 'vendor' | null>(null);
  const [operationsNotice, setOperationsNotice] = useState('');

  const navigateToHash = (hash: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    window.location.hash = hash;
  };

  useEffect(() => {
    const applyHash = () => {
      const nextSubsection = parseAccountingSubsectionHash(window.location.hash);
      if (nextSubsection) {
        setActiveSubsection((previous) =>
          previous === nextSubsection ? previous : nextSubsection,
        );
        return;
      }

      const nextAction = parseAccountingActionHash(window.location.hash);
      if (!nextAction) {
        return;
      }

      const replaceHash = (hash: string) => {
        const nextUrl = `${window.location.pathname}${window.location.search}${hash}`;
        window.history.replaceState(null, '', nextUrl);
      };

      switch (nextAction) {
        case 'new-customer':
          setCounterpartyModalMode('customer');
          setActiveSubsection('customers');
          replaceHash('#accounting:customers');
          break;
        case 'new-vendor':
          setCounterpartyModalMode('vendor');
          setActiveSubsection('vendors');
          replaceHash('#accounting:vendors');
          break;
        case 'new-employee':
          setIsEmployeeModalOpen(true);
          setActiveSubsection('payroll');
          replaceHash('#accounting:payroll');
          break;
        case 'new-invoice':
          setIsInvoiceModalOpen(true);
          setActiveSubsection('invoices');
          replaceHash('#accounting:invoices');
          break;
        case 'new-payment':
          setIsPaymentModalOpen(true);
          setActiveSubsection('payments');
          replaceHash('#accounting:payments');
          break;
        case 'new-direct-deposit':
          setIsDirectDepositModalOpen(true);
          setActiveSubsection('payroll');
          replaceHash('#accounting:payroll');
          break;
        case 'new-journal':
          setIsJournalModalOpen(true);
          setActiveSubsection('journal');
          replaceHash('#accounting:journal');
          break;
        case 'new-bill':
          setIsBillModalOpen(true);
          setActiveSubsection('bills');
          replaceHash('#accounting:bills');
          break;
        case 'new-receipt':
          setIsReceiptModalOpen(true);
          setActiveSubsection('receipts');
          replaceHash('#accounting:receipts');
          break;
        case 'new-presentment':
          setIsCouponPresentmentModalOpen(true);
          setActiveSubsection('presentments');
          replaceHash('#accounting:presentments');
          break;
        case 'new-quote':
          setIsQuoteModalOpen(true);
          setActiveSubsection('quotes');
          replaceHash('#accounting:quotes');
          break;
        case 'new-intercompany':
          setIsIntercompanyModalOpen(true);
          setActiveSubsection('intercompany');
          replaceHash('#accounting:intercompany');
          break;
        case 'new-bank-account':
          setIsManualBankAccountModalOpen(true);
          setActiveSubsection('bankFeed');
          replaceHash('#accounting:bankFeed');
          break;
        case 'new-bank-transaction':
          setIsManualBankTransactionModalOpen(true);
          setActiveSubsection('bankFeed');
          replaceHash('#accounting:bankFeed');
          break;
      }
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const invoices = data.invoices ?? [];
  const bills = data.bills ?? [];
  const expenses = data.expenses ?? [];
  const receipts = data.receipts ?? [];
  const couponPresentments = data.couponPresentments ?? [];
  const employees = data.employees ?? [];
  const directDepositAuthorizations = data.directDepositAuthorizations ?? [];
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
  const instrumentSettlements = data.instrumentSettlements ?? [];
  const obligations = data.obligations ?? [];
  const complianceTags = data.complianceTags ?? [];
  const movementIdentifiers = data.movementIdentifiers ?? [];
  const returnEvents = data.returnEvents ?? [];
  const reclamationEvents = data.reclamationEvents ?? [];
  const taxReportingLinks = data.taxReportingLinks ?? [];
  const wallets = data.wallets ?? [];
  const digitalAssets = data.digitalAssets ?? [];

  const quoteRecords = invoices.filter(isQuoteRecord);
  const standardInvoices = invoices.filter((record) => !isQuoteRecord(record));
  const stats = useMemo(() => buildAccountingStats(data, journalEntries), [data, journalEntries]);
  const remittanceRailControls = useMemo(() => buildRemittanceRailControls(data), [data]);
  const defaultEntity = getPrimaryEntity(data);
  const defaultPayrollEntity =
    data.entities.find((entity) =>
      entity.type === 'llc' ||
      entity.type === 'corporation' ||
      entity.type === 'partnership' ||
      entity.type === 'nonprofit'
    ) || defaultEntity;

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

  const resolveSettlementExecutionSourceType = ({
    sourceBankAccountId,
    sourceLedgerAccountId,
    treasuryAccountId,
  }: {
    sourceBankAccountId?: string;
    sourceLedgerAccountId?: string;
    treasuryAccountId?: string;
  }) =>
    sourceBankAccountId
      ? ('bank_account' as const)
      : sourceLedgerAccountId || treasuryAccountId
        ? ('ledger_account' as const)
        : ('manual_remittance' as const);

  const resolveSettlementExecutionRail = (
    method: PaymentSubmitPayload['method'],
    urgency?: PaymentSubmitPayload['urgency']
  ) => {
    if (method === 'wire') {
      return 'Fedwire' as const;
    }

    if (method === 'ach') {
      return urgency === 'same_day' ? ('SameDayACH' as const) : ('StandardACH' as const);
    }

    return 'None' as const;
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
    storageOwner: 'user_owned',
    retentionClass: 'financial_evidence',
    storageNotes:
      'ERP-generated document record ready for vault review and user-owned Google Drive routing when enabled.',
    externalStorageTarget: 'google_drive',
    externalStorageStatus: 'ready',
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
      digitalPayoutTemplate?: 'stablecoin' | 'native_asset' | 'manual_confirmation';
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
            digitalPayoutTemplate: payload.digitalPayoutTemplate || undefined,
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
    storageOwner,
    retentionClass,
    externalStorageTarget,
    externalStorageStatus,
    storageNotes,
  }: {
    entityId: string;
    folder: 'bills' | 'receipts' | 'documents';
    title: string;
    summary: string;
    sourceRecordType:
      | 'bill'
      | 'receipt'
      | 'document'
      | 'reconciliation'
      | 'coupon_presentment'
      | 'direct_deposit_request';
    sourceRecordId: string;
    file?: File | null;
    date: string;
    storageOwner?: DocumentRecord['storageOwner'];
    retentionClass?: DocumentRecord['retentionClass'];
    externalStorageTarget?: DocumentRecord['externalStorageTarget'];
    externalStorageStatus?: DocumentRecord['externalStorageStatus'];
    storageNotes?: string;
  }) => {
    if (!file) {
      return null;
    }

    try {
      const resolvedStorageOwner =
        storageOwner ||
        (sourceRecordType === 'direct_deposit_request'
          ? 'clearflow_retained'
          : 'user_owned');
      const resolvedRetentionClass =
        retentionClass ||
        (sourceRecordType === 'reconciliation' ||
        sourceRecordType === 'bill' ||
        sourceRecordType === 'receipt' ||
        sourceRecordType === 'coupon_presentment'
          ? 'financial_evidence'
          : sourceRecordType === 'direct_deposit_request'
            ? 'payroll'
            : 'operational');
      const sourceFileId = `vault-${sourceRecordType}-${Date.now()}`;
      const fileMetadata = await saveDocumentFile(sourceFileId, file);
      const shouldAutoRouteToDrive =
        resolvedStorageOwner === 'user_owned' &&
        data.workspaceSettings.autoRouteUserOwnedDocumentsToDrive &&
        auth.hasDriveAccess;
      const driveRoutingResult = shouldAutoRouteToDrive
        ? await auth.routeDocumentToDrive({
            sourceFileId: fileMetadata.sourceFileId,
            fileName: fileMetadata.fileName,
          })
        : null;

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
        storageOwner: resolvedStorageOwner,
        retentionClass: resolvedRetentionClass,
        externalStorageTarget:
          resolvedStorageOwner === 'user_owned'
            ? 'google_drive'
            : externalStorageTarget,
        externalStorageStatus:
          resolvedStorageOwner === 'user_owned'
            ? driveRoutingResult?.success
              ? 'routed'
              : shouldAutoRouteToDrive
                ? 'error'
                : externalStorageStatus || 'ready'
            : externalStorageStatus || 'not_applicable',
        externalStorageFileId:
          resolvedStorageOwner === 'user_owned' && driveRoutingResult?.success
            ? driveRoutingResult.fileId
            : undefined,
        externalStorageLabel:
          resolvedStorageOwner === 'user_owned'
            ? driveRoutingResult?.success
              ? 'Auto-routed to Google Drive'
              : shouldAutoRouteToDrive
                ? driveRoutingResult?.error || 'Automatic Google Drive routing failed'
                : 'Ready for Google Drive routing'
            : undefined,
        externalStorageRoutedAt:
          resolvedStorageOwner === 'user_owned' && driveRoutingResult?.success
            ? new Date().toISOString()
            : undefined,
        storageNotes,
      };

      return nextDocument;
    } catch (error) {
      console.warn('Failed to persist uploaded source document.', error);
      return null;
    }
  };

  const addDaysToIsoDate = (value: string, days: number) => {
    const next = new Date(`${value}T12:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString().slice(0, 10);
  };

  const buildNumericReference = (seed: number, length = 15) =>
    String(seed).replace(/\D/g, '').padStart(length, '0').slice(-length);

  const startOfCurrentMonthIso = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  };

  const endOfCurrentMonthIso = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  };

  const ensureOperationalReconciliationForBank = (
    prev: CoreDataBundle,
    bankAccount: CoreDataBundle['bankAccounts'][number],
    preparedBy: string,
  ) => {
    const existing =
      prev.reconciliations.find(
        (item) =>
          item.bankAccountId === bankAccount.id &&
          (item.status === 'open' || item.status === 'in_review'),
      ) ||
      prev.reconciliations.find(
        (item) =>
          item.bankAccountId === bankAccount.id &&
          item.periodStart === startOfCurrentMonthIso() &&
          item.periodEnd === endOfCurrentMonthIso(),
      );

    if (existing) {
      return { record: existing, reconciliations: prev.reconciliations };
    }

    const nextRecord = {
      id: `rec-${bankAccount.id}-${Date.now()}`,
      entityId: bankAccount.entityId,
      bankAccountId: bankAccount.id,
      periodStart: startOfCurrentMonthIso(),
      periodEnd: endOfCurrentMonthIso(),
      statementEndingBalance: bankAccount.currentBalance ?? 0,
      clearedTransactionIds: [],
      status: 'open' as const,
      preparedBy,
      statementReviewStatus: 'not_imported' as const,
      closeApprovalStatus: 'pending' as const,
    };

    return {
      record: nextRecord,
      reconciliations: [nextRecord, ...(prev.reconciliations ?? [])],
    };
  };

  const applyOperationalReconciliationStatus = ({
    prev,
    bankAccount,
    transactionId,
    state,
    note,
    preparedBy,
  }: {
    prev: CoreDataBundle;
    bankAccount?: CoreDataBundle['bankAccounts'][number];
    transactionId: string;
    state: 'pending' | 'matched' | 'exception';
    note: string;
    preparedBy: string;
  }) => {
    if (!bankAccount) {
      return {
        linkedReconciliationId: undefined,
        reconciliations: prev.reconciliations,
      };
    }

    const { record, reconciliations } = ensureOperationalReconciliationForBank(
      prev,
      bankAccount,
      preparedBy,
    );
    const nextReconciliations = reconciliations.map((item) => {
      if (item.id !== record.id) {
        return item;
      }

      const nextClearedTransactionIds =
        state === 'matched'
          ? Array.from(new Set([...(item.clearedTransactionIds ?? []), transactionId]))
          : (item.clearedTransactionIds ?? []).filter((id) => id !== transactionId);
      const nextUnmatchedTransactionIds =
        state === 'pending' || state === 'exception'
          ? Array.from(new Set([...(item.unmatchedTransactionIds ?? []), transactionId]))
          : (item.unmatchedTransactionIds ?? []).filter((id) => id !== transactionId);
      const nextNotes = Array.from(new Set([item.notes, note].filter(Boolean))).join(' | ');

      return {
        ...item,
        clearedTransactionIds: nextClearedTransactionIds,
        unmatchedTransactionIds: nextUnmatchedTransactionIds,
        status: state === 'matched' ? ('in_review' as const) : ('open' as const),
        notes: nextNotes || item.notes,
      };
    });

    return {
      linkedReconciliationId: record.id,
      reconciliations: nextReconciliations,
    };
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

  const handleCouponPresentmentSubmit = async (payload: CouponPresentmentSubmitPayload) => {
    const entity = data.entities[0];
    if (!entity) {
      return;
    }

    const stamp = Date.now();
    const presentmentDate = payload.presentmentDate || new Date().toISOString().slice(0, 10);
    const presentmentId = `cpn-${stamp}`;
    const paymentId = `pay-${stamp}`;
    const transactionId = `txn-${stamp}`;
    const settlementId = `set-${stamp}`;
    const journalId = `je-${stamp}`;
    const remittanceStatementId = `remit-${stamp}`;
    const extraction = await analyzeAccountingUpload('coupon', payload.uploadedFile);
    const resolvedAmount = Number(payload.amount || 0) || extraction.amount || 0;
    if (!resolvedAmount) {
      return;
    }

    const sourceDocument = await persistUploadDocument({
      entityId: entity.id,
      folder: 'documents',
      title: payload.title || payload.couponReference || `${entity.displayName || entity.name} Coupon Presentment`,
      summary:
        payload.parsedNotes ||
        extraction.summary ||
        'Coupon presentment intake source for remittance and performance settlement.',
      sourceRecordType: 'coupon_presentment',
      sourceRecordId: presentmentId,
      file: payload.uploadedFile,
      date: presentmentDate,
    });

    setData((prev) => {
      const currentEntity = prev.entities[0];
      if (!currentEntity) {
        return prev;
      }

      const selectedTreasuryAccount = payload.treasuryAccountId
        ? prev.treasuryAccounts.find((account) => account.id === payload.treasuryAccountId)
        : prev.treasuryAccounts.find(
            (account) => account.entityId === currentEntity.id && account.remittanceEnabled
          );
      const sourceBankAccount = payload.sourceBankAccountId
        ? prev.bankAccounts.find((account) => account.id === payload.sourceBankAccountId)
        : undefined;
      const sourceLedgerAccount = payload.sourceLedgerAccountId
        ? prev.ledgerAccounts.find((account) => account.id === payload.sourceLedgerAccountId)
        : selectedTreasuryAccount?.linkedLedgerAccountId
          ? prev.ledgerAccounts.find(
              (account) => account.id === selectedTreasuryAccount.linkedLedgerAccountId
            )
          : prev.ledgerAccounts.find(
              (account) =>
                account.entityId === currentEntity.id &&
                (account.remittanceEligible ||
                  account.remittanceClassification === 'cash' ||
                  account.remittanceClassification === 'obligation')
            );
      const linkedObligation = payload.obligationId
        ? prev.obligations.find((record) => record.id === payload.obligationId)
        : undefined;
      const existingInstrumentSettlement = payload.instrumentSettlementId
        ? prev.instrumentSettlements.find((record) => record.id === payload.instrumentSettlementId)
        : undefined;
      const linkedInstrument = existingInstrumentSettlement?.instrumentId
        ? prev.instruments.find((record) => record.id === existingInstrumentSettlement.instrumentId)
        : linkedObligation?.linkedInstrumentIds?.[0]
          ? prev.instruments.find((record) => record.id === linkedObligation.linkedInstrumentIds?.[0])
          : undefined;

      const shouldIssueToken = shouldAutoIssueTokens(currentEntity, prev.workspaceSettings);
      const token: TokenRecord | null = shouldIssueToken
        ? {
            id: `tok-${stamp}`,
            entityId: currentEntity.id,
            subjectType: 'settlement',
            subjectId: settlementId,
            label: `${payload.couponReference || 'Coupon'} Performance Token`,
            status: 'issued',
            tokenStandard: 'internal-proof',
            tokenReference: `CPN-${stamp}`,
            issuedAt: new Date().toISOString(),
            proofReference: 'Issued automatically from coupon presentment and settlement controls.',
            notes:
              payload.parsedNotes ||
              extraction.summary ||
              'Coupon presentment proof token issued from ERP workflow.',
          }
        : null;

      const dischargeCompletesPerformance =
        payload.dischargeMethod === 'instrument_performance' ||
        payload.dischargeMethod === 'internal_ledger_credit';
      const settlementPath: SettlementPath =
        payload.dischargeMethod === 'bank_rail_payment'
          ? sourceBankAccount?.wireEnabled
            ? 'wire'
            : 'ach'
          : payload.dischargeMethod === 'mixed_discharge'
            ? 'mixed'
            : 'internal_ledger';

      const nextInstrumentSettlement =
        existingInstrumentSettlement
          ? {
              ...existingInstrumentSettlement,
              treasuryAccountId:
                selectedTreasuryAccount?.id || existingInstrumentSettlement.treasuryAccountId,
              linkedSettlementId: settlementId,
              linkedTransactionId: transactionId,
              linkedDocumentIds: sourceDocument
                ? Array.from(
                    new Set([sourceDocument.id, ...(existingInstrumentSettlement.linkedDocumentIds ?? [])])
                  )
                : existingInstrumentSettlement.linkedDocumentIds,
              linkedTokenIds: token
                ? Array.from(
                    new Set([token.id, ...(existingInstrumentSettlement.linkedTokenIds ?? [])])
                  )
                : existingInstrumentSettlement.linkedTokenIds,
              performedAmount: Number(
                (existingInstrumentSettlement.performedAmount + resolvedAmount).toFixed(2)
              ),
              performanceStatus:
                dischargeCompletesPerformance &&
                existingInstrumentSettlement.performedAmount + resolvedAmount >=
                  existingInstrumentSettlement.faceAmount
                  ? 'performed'
                  : 'presented',
              remittanceReference:
                payload.couponReference || existingInstrumentSettlement.remittanceReference,
              notes:
                payload.parsedNotes ||
                extraction.summary ||
                existingInstrumentSettlement.notes,
            }
          : {
              id: `ins-${stamp}`,
              entityId: currentEntity.id,
              title:
                payload.title ||
                `${linkedObligation?.title || linkedInstrument?.title || 'Coupon'} Presentment`,
              instrumentId: linkedInstrument?.id,
              obligationId: linkedObligation?.id,
              treasuryAccountId: selectedTreasuryAccount?.id,
              linkedSettlementId: settlementId,
              linkedTransactionId: transactionId,
              linkedDocumentIds: sourceDocument ? [sourceDocument.id] : undefined,
              linkedTokenIds: token ? [token.id] : undefined,
              dischargeMethod: payload.dischargeMethod,
              recognitionBasis: 'obligation_recognized_before_cash',
              performanceStatus: dischargeCompletesPerformance ? 'performed' : 'presented',
              faceAmount: linkedObligation?.amount || resolvedAmount,
              performedAmount: dischargeCompletesPerformance ? resolvedAmount : 0,
              currency: 'USD',
              effectiveDate: presentmentDate,
              dueDate: payload.dueDate || extraction.date,
              remittanceReference: payload.couponReference || `CPN-${stamp}`,
              notes:
                payload.parsedNotes ||
                extraction.summary ||
                'Created from coupon presentment workflow.',
            };

      const remittanceStatement = {
        id: remittanceStatementId,
        entityId: currentEntity.id,
        title:
          payload.title ||
          `${payload.couponReference || 'Coupon'} Remittance Statement`,
        statementDate: presentmentDate,
        payerName: currentEntity.displayName || currentEntity.name,
        payeeName: payload.receiverName || extraction.vendorOrMerchantName || 'Receiver',
        amount: resolvedAmount,
        currency: 'USD',
        dischargeMethod: payload.dischargeMethod,
        treasuryAccountId: selectedTreasuryAccount?.id,
        linkedInstrumentSettlementId: nextInstrumentSettlement.id,
        linkedSettlementId: settlementId,
        linkedObligationIds: linkedObligation ? [linkedObligation.id] : undefined,
        linkedDocumentIds: sourceDocument ? [sourceDocument.id] : undefined,
        micrLine: {
          routingNumber:
            payload.dischargeMethod === 'bank_rail_payment'
              ? sourceBankAccount?.routingNumber
              : undefined,
          accountNumberMask:
            payload.dischargeMethod === 'bank_rail_payment'
              ? sourceBankAccount?.last4 || sourceBankAccount?.accountNumber?.slice(-4)
              : sourceLedgerAccount?.code,
          serialNumber: String(stamp).slice(-6),
          mode:
            payload.dischargeMethod === 'bank_rail_payment' && sourceBankAccount
              ? 'bank_backed'
              : 'informational_only',
        },
        status: dischargeCompletesPerformance ? 'performed' : 'issued',
        notes:
          payload.parsedNotes ||
          extraction.summary ||
          'Generated from coupon presentment workflow.',
      };

      const paymentRecord = {
        id: paymentId,
        entityId: currentEntity.id,
        direction: 'outgoing' as const,
        counterpartyType: 'other' as const,
        paymentDate: presentmentDate,
        amount: resolvedAmount,
        currency: 'USD',
        method:
          payload.dischargeMethod === 'bank_rail_payment'
            ? (sourceBankAccount?.wireEnabled ? 'wire' : 'check')
            : ('other' as const),
        status:
          payload.dischargeMethod === 'bank_rail_payment'
            ? ('initiated' as const)
            : ('settled' as const),
        linkedTransactionIds: [transactionId],
        linkedSettlementId: settlementId,
        linkedDocumentIds: sourceDocument ? [sourceDocument.id] : undefined,
        sourceBankAccountId: sourceBankAccount?.id,
        sourceLedgerAccountId: sourceLedgerAccount?.id,
        treasuryAccountId: selectedTreasuryAccount?.id,
        dischargeMethod: payload.dischargeMethod,
        approvalStatus: 'approved' as const,
        approvedBy: currentEntity.representativeName || 'ClearFlow Operator',
        approvedAt: new Date().toISOString(),
        releaseStatus:
          payload.dischargeMethod === 'bank_rail_payment'
            ? ('ready_to_release' as const)
            : ('released' as const),
        releasedBy:
          payload.dischargeMethod === 'bank_rail_payment'
            ? undefined
            : currentEntity.representativeName || 'ClearFlow Operator',
        releasedAt:
          payload.dischargeMethod === 'bank_rail_payment'
            ? undefined
            : new Date().toISOString(),
        releaseTokenId: token?.id,
        notes:
          payload.receiverAccountLabel ||
          payload.parsedNotes ||
          extraction.summary ||
          undefined,
      };
      const couponOperationalReconciliation = applyOperationalReconciliationStatus({
        prev,
        bankAccount: sourceBankAccount,
        transactionId,
        state:
          payload.dischargeMethod === 'bank_rail_payment'
            ? 'pending'
            : 'matched',
        note:
          payload.parsedNotes ||
          extraction.summary ||
          'Operational coupon presentment generated from ERP remittance workflow.',
        preparedBy: 'ERP Coupon Presentment',
      });

      const settlementRecord = {
        id: settlementId,
        entityId: currentEntity.id,
        linkedTransactionId: transactionId,
        linkedPaymentId: paymentId,
        linkedJournalEntryIds: [journalId],
        linkedReconciliationId: couponOperationalReconciliation.linkedReconciliationId,
        linkedInstrumentSettlementId: nextInstrumentSettlement.id,
        linkedRemittanceStatementId: remittanceStatementId,
        path: settlementPath,
        dischargeMethod: payload.dischargeMethod,
        direction: 'outgoing' as const,
        status:
          payload.dischargeMethod === 'bank_rail_payment'
            ? ('routing' as const)
            : payload.dischargeMethod === 'mixed_discharge'
              ? ('verifying' as const)
              : ('settled' as const),
        liquidCashStage:
          payload.dischargeMethod === 'bank_rail_payment'
            ? ('liquid_cash_pending' as const)
            : ('liquid_cash_released' as const),
        verificationMethod:
          payload.dischargeMethod === 'bank_rail_payment'
            ? ('bank_confirmation' as const)
            : ('internal_control_token' as const),
        verificationStatus:
          payload.dischargeMethod === 'bank_rail_payment'
            ? ('pending' as const)
            : ('verified' as const),
        verificationReference:
          payload.receiverAccountLabel ||
          `Coupon presentment issued to ${payload.receiverName || extraction.vendorOrMerchantName || 'receiver'}.`,
        tokenizedProofId: token?.id,
        linkedTokenIds: token ? [token.id] : undefined,
        grossAmount: resolvedAmount,
        settledAmount: resolvedAmount,
        currency: 'USD',
        initiatedAt: presentmentDate,
        expectedSettlementDate: payload.dueDate || extraction.date || presentmentDate,
        actualSettlementDate: dischargeCompletesPerformance ? presentmentDate : undefined,
        originSourceType: sourceBankAccount
          ? 'bank_account'
          : sourceLedgerAccount || selectedTreasuryAccount
            ? 'ledger_account'
            : 'manual_remittance',
        executionRail:
          payload.dischargeMethod === 'bank_rail_payment'
            ? sourceBankAccount?.wireEnabled
              ? 'Fedwire'
              : 'StandardACH'
            : sourceLedgerAccount || selectedTreasuryAccount
              ? 'LedgerRemittance'
              : 'None',
        processorStatus:
          payload.dischargeMethod === 'bank_rail_payment'
            ? 'processing'
            : 'settled',
        executionReason:
          payload.dischargeMethod === 'instrument_performance'
            ? 'Coupon performance posted against the linked obligation and instrument.'
            : payload.dischargeMethod === 'internal_ledger_credit'
              ? 'Coupon discharged internally through ledger and treasury remittance controls.'
              : payload.dischargeMethod === 'mixed_discharge'
                ? 'Coupon presentment issued pending mixed settlement completion.'
                : 'Coupon presentment queued to bank rail.',
        executionReference: payload.couponReference || `CPN-${stamp}`,
        releasedAt: dischargeCompletesPerformance ? new Date().toISOString() : undefined,
        releasedBy:
          dischargeCompletesPerformance
            ? currentEntity.representativeName || 'ClearFlow Operator'
            : undefined,
        reserveBacked: selectedTreasuryAccount?.treasuryType === 'reserve',
        requiresManualReview: payload.dischargeMethod === 'mixed_discharge',
        autoReconcileStatus:
          payload.dischargeMethod === 'bank_rail_payment' ? 'pending' : 'matched',
        notes:
          payload.parsedNotes ||
          extraction.summary ||
          'Posted from coupon presentment workflow.',
      };

      const transactionRecord = {
        id: transactionId,
        entityId: currentEntity.id,
        type: 'withdrawal' as const,
        title:
          payload.title ||
          `${payload.couponReference || 'Coupon'} Presentment to ${payload.receiverName || extraction.vendorOrMerchantName || 'receiver'}`,
        amount: resolvedAmount,
        currency: 'USD',
        date: presentmentDate,
        status:
          payload.dischargeMethod === 'bank_rail_payment' ? ('pending' as const) : ('posted' as const),
        linkedDocumentIds: sourceDocument ? [sourceDocument.id] : undefined,
        linkedSettlementId: settlementId,
        linkedPaymentIds: [paymentId],
        linkedJournalEntryIds: [journalId],
        linkedTokenIds: token ? [token.id] : undefined,
        notes:
          payload.receiverAccountLabel ||
          payload.parsedNotes ||
          extraction.summary ||
          undefined,
      };

      const journalEntry = {
        id: journalId,
        entityId: currentEntity.id,
        entryNumber: buildEntityScopedNumber(
          currentEntity,
          'journal',
          '',
          String(getEntityNextSequence(currentEntity, 'journal'))
        ),
        entryDate: presentmentDate,
        memo:
          payload.title ||
          `${payload.couponReference || 'Coupon'} presentment for ${payload.receiverName || extraction.vendorOrMerchantName || 'receiver'}`,
        debitAccount:
          linkedObligation?.title ||
          existingInstrumentSettlement?.title ||
          '2105 Remittance Obligations Clearing',
        creditAccount:
          sourceLedgerAccount
            ? `${sourceLedgerAccount.code} ${sourceLedgerAccount.name}`
            : selectedTreasuryAccount?.name ||
              sourceBankAccount?.accountName ||
              '1000 Operating Cash',
        amount: resolvedAmount,
        status: 'posted' as const,
        source: 'system' as const,
        linkedTransactionIds: [transactionId],
        linkedSettlementIds: [settlementId],
        autoReconcileStatus:
          payload.dischargeMethod === 'bank_rail_payment' ? 'pending' : 'matched',
        linkedDocumentIds: sourceDocument ? [sourceDocument.id] : undefined,
        verificationRequired: payload.dischargeMethod !== 'bank_rail_payment',
      };
      const nextCouponMovementIdentifier =
        payload.dischargeMethod === 'bank_rail_payment' && sourceBankAccount
          ? sourceBankAccount.wireEnabled
            ? {
                id: `mid-${stamp}`,
                entityId: currentEntity.id,
                railNamespace: 'fedwire' as const,
                movementType: 'wire' as const,
                linkedPaymentId: paymentId,
                linkedSettlementId: settlementId,
                linkedRemittanceStatementId: remittanceStatementId,
                linkedCouponPresentmentId: presentmentId,
                primaryIdentifier: `IMAD-${buildNumericReference(stamp, 20)}`,
                secondaryIdentifier: `OMAD-${buildNumericReference(stamp + 29, 20)}`,
                imad: `IMAD-${buildNumericReference(stamp, 20)}`,
                omad: `OMAD-${buildNumericReference(stamp + 29, 20)}`,
                routingNumber: sourceBankAccount.routingNumber,
                effectiveDate: presentmentDate,
                status: 'active' as const,
                notes:
                  'Fedwire movement identifiers generated automatically from coupon presentment release.',
              }
            : {
                id: `mid-${stamp}`,
                entityId: currentEntity.id,
                railNamespace: 'treasury_check_gold_book' as const,
                movementType: 'coupon_presentment' as const,
                linkedPaymentId: paymentId,
                linkedSettlementId: settlementId,
                linkedRemittanceStatementId: remittanceStatementId,
                linkedCouponPresentmentId: presentmentId,
                primaryIdentifier: `CPN-${payload.couponReference || stamp}`,
                secondaryIdentifier: remittanceStatement.micrLine.serialNumber,
                routingNumber: sourceBankAccount.routingNumber,
                effectiveDate: presentmentDate,
                returnDeadline: addDaysToIsoDate(presentmentDate, 30),
                status: 'active' as const,
                notes:
                  'Bank-backed coupon presentment reference generated for remittance and reclamation tracking.',
              }
          : undefined;
      const couponPresentment = {
        id: presentmentId,
        entityId: currentEntity.id,
        title:
          payload.title ||
          `${payload.couponReference || 'Coupon'} Presentment`,
        couponReference: payload.couponReference || undefined,
        instrumentId: linkedInstrument?.id,
        obligationId: linkedObligation?.id,
        instrumentSettlementId: nextInstrumentSettlement.id,
        treasuryAccountId: selectedTreasuryAccount?.id,
        sourceBankAccountId: sourceBankAccount?.id,
        sourceLedgerAccountId: sourceLedgerAccount?.id,
        receiverName: payload.receiverName || extraction.vendorOrMerchantName || 'Receiver',
        receiverAccountLabel: payload.receiverAccountLabel || undefined,
        presentmentDate,
        dueDate: payload.dueDate || extraction.date,
        amount: resolvedAmount,
        currency: 'USD',
        dischargeMethod: payload.dischargeMethod,
        sourceType: payload.mode === 'camera' ? 'photo' : payload.mode,
        status:
          payload.dischargeMethod === 'bank_rail_payment'
            ? 'presented'
            : dischargeCompletesPerformance
              ? 'performed'
              : 'accepted',
        linkedPaymentId: paymentId,
        linkedSettlementId: settlementId,
        linkedJournalEntryId: journalId,
        linkedRemittanceStatementId: remittanceStatementId,
        linkedDocumentIds: sourceDocument ? [sourceDocument.id] : undefined,
        linkedTokenIds: token ? [token.id] : undefined,
        extractionSummary: extraction.summary,
        extractedReceiverName: extraction.vendorOrMerchantName,
        extractedAmount: extraction.amount,
        extractedDueDate: extraction.date,
        notes:
          payload.parsedNotes ||
          extraction.summary ||
          'Coupon presentment recorded from accounting workflow.',
      };

      return {
        ...prev,
        entities: prev.entities.map((item) =>
          item.id === currentEntity.id ? incrementEntitySequence(item, 'journal') : item
        ),
        payments: [paymentRecord, ...(prev.payments ?? [])],
        settlements: [settlementRecord, ...(prev.settlements ?? [])],
        reconciliations: couponOperationalReconciliation.reconciliations,
        remittanceStatements: [remittanceStatement, ...(prev.remittanceStatements ?? [])],
        couponPresentments: [couponPresentment, ...(prev.couponPresentments ?? [])],
        transactions: [transactionRecord, ...(prev.transactions ?? [])],
        journalEntries: [journalEntry, ...(prev.journalEntries ?? [])],
        instrumentSettlements: existingInstrumentSettlement
          ? prev.instrumentSettlements.map((item) =>
              item.id === existingInstrumentSettlement.id ? nextInstrumentSettlement : item
            )
          : [nextInstrumentSettlement, ...(prev.instrumentSettlements ?? [])],
        obligations: linkedObligation
          ? prev.obligations.map((item) =>
              item.id === linkedObligation.id
                ? {
                    ...item,
                    status:
                      dischargeCompletesPerformance && resolvedAmount >= item.amount
                        ? ('satisfied' as const)
                        : item.status,
                    gainOrLossOnDischarge: item.gainOrLossOnDischarge ?? 0,
                  }
                : item
            )
          : prev.obligations,
        tokens: token ? [token, ...(prev.tokens ?? [])] : prev.tokens,
        documents: sourceDocument ? [sourceDocument, ...(prev.documents ?? [])] : prev.documents,
        movementIdentifiers: nextCouponMovementIdentifier
          ? [nextCouponMovementIdentifier, ...(prev.movementIdentifiers ?? [])]
          : prev.movementIdentifiers,
      };
    });

    setActiveSubsection('presentments');
    setIsCouponPresentmentModalOpen(false);
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
    const policyReleaseHoldReason =
      requiresSettlementExecution &&
      data.workspaceSettings.requireVerifiedVendorBankInstructions &&
      selectedVendor?.paymentInstructions?.verificationStatus !== 'verified'
        ? 'Vendor bank instructions must be fully verified before release.'
        : requiresSettlementExecution &&
            payload.method === 'wire' &&
            amount >= data.workspaceSettings.wireReleaseReviewThreshold
          ? `Wire amount exceeds the release review threshold of ${formatCurrency(
              data.workspaceSettings.wireReleaseReviewThreshold,
              entity.operationalDefaults?.baseCurrency || data.workspaceSettings.baseCurrency,
            )}.`
          : requiresSettlementExecution &&
              payload.method === 'ach' &&
              amount >= data.workspaceSettings.achReleaseReviewThreshold
            ? `ACH amount exceeds the release review threshold of ${formatCurrency(
                data.workspaceSettings.achReleaseReviewThreshold,
                entity.operationalDefaults?.baseCurrency || data.workspaceSettings.baseCurrency,
              )}.`
            : undefined;
    const requiresWalletExecution =
      payload.direction === 'outgoing' &&
      payload.counterpartyType === 'vendor' &&
      payload.method === 'digital_asset' &&
      Boolean(selectedWallet);
    const settlementExecutionResponse = requiresSettlementExecution && !policyReleaseHoldReason
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
        requiresSettlementExecution ||
        Boolean(policyReleaseHoldReason);
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
        policyReleaseHoldReason
          ? ('initiated' as const)
          : settlementExecutionResponse?.execution.processorStatus === 'blocked'
          ? ('failed' as const)
          : settlementExecutionResponse?.execution.processorStatus === 'settled'
            ? ('settled' as const)
            : settlementExecutionResponse?.execution
              ? ('initiated' as const)
              : requiresWalletExecution
                ? ('initiated' as const)
              : ('settled' as const);
      const settlementStatus =
        policyReleaseHoldReason
          ? ('exception' as const)
          : settlementExecutionResponse?.execution.processorStatus === 'blocked' ||
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
          requiresSettlementExecution || requiresWalletExecution || Boolean(policyReleaseHoldReason)
            ? ('pending' as const)
            : ('not_required' as const),
        complianceConfirmationStatus: policyReleaseHoldReason
          ? ('pending' as const)
          : ('not_required' as const),
        complianceConfirmedBy: undefined,
        complianceConfirmedAt: undefined,
        complianceConfirmationNote: policyReleaseHoldReason,
        releaseStatus:
          requiresSettlementExecution || requiresWalletExecution || Boolean(policyReleaseHoldReason)
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
          : policyReleaseHoldReason
            ? {
                sourceType: resolveSettlementExecutionSourceType({
                  sourceBankAccountId: sourceBankAccount?.id,
                  sourceLedgerAccountId: sourceLedgerAccount?.id,
                  treasuryAccountId: selectedTreasuryAccount?.id,
                }),
                executionRail: resolveSettlementExecutionRail(payload.method, payload.urgency),
                processorStatus: 'requires_review',
                executionReason: policyReleaseHoldReason,
                executionReference: `HOLD-${stamp}`,
                vendorInstructionVerified:
                  selectedVendor?.paymentInstructions?.verificationStatus === 'verified',
                simulatedProcessing: true,
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
        recurringSchedule: payload.recurringEnabled
          ? {
              enabled: true,
              frequency: payload.recurringFrequency,
              interval: Number(payload.recurringInterval || 1),
              nextRunDate:
                payload.recurringNextRunDate || payload.paymentDate || new Date().toISOString().slice(0, 10),
              autoPostEnabled: payload.recurringAutoPost,
              note: 'Recurring payment template created from ERP payment posting.',
            }
          : {
              enabled: false,
            },
        notes:
          payload.notes ||
          policyReleaseHoldReason ||
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
      const operationalReconciliation = applyOperationalReconciliationStatus({
        prev,
        bankAccount: sourceBankAccount,
        transactionId,
        state:
          settlementExecutionResponse?.execution.processorStatus === 'blocked' ||
          settlementExecutionResponse?.execution.processorStatus === 'requires_review'
            ? 'exception'
            : paymentStatus === 'settled'
              ? 'matched'
              : sourceBankAccount
                ? 'pending'
                : 'matched',
        note:
          settlementExecutionResponse?.execution.executionReason ||
          `Operational ${payload.method} movement generated from ERP payment posting.`,
        preparedBy: 'ERP Payment Posting',
      });
      const nextSettlement = {
        id: settlementId,
        entityId: entity.id,
        linkedTransactionId: transactionId,
        linkedPaymentId: paymentId,
        linkedJournalEntryIds: [journalId],
        linkedReconciliationId: operationalReconciliation.linkedReconciliationId,
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
          : policyReleaseHoldReason
            ? ('manual_override' as const)
          : payload.method === 'digital_asset'
            ? ('wallet_confirmation' as const)
            : settlementToken
              ? ('internal_control_token' as const)
              : ('bank_confirmation' as const),
        verificationStatus: settlementExecutionResponse
          ? settlementExecutionResponse.execution.verificationStatus
          : policyReleaseHoldReason
            ? ('exception' as const)
          : requiresWalletExecution
            ? ('pending' as const)
          : settlementToken || payload.method === 'digital_asset'
            ? ('pending' as const)
            : ('verified' as const),
        verificationReference:
          policyReleaseHoldReason ||
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
          (policyReleaseHoldReason ? ('requires_review' as const) : undefined) ||
          settlementExecutionResponse?.execution.processorStatus ||
          (requiresWalletExecution
            ? ('queued' as const)
            : payload.method === 'digital_asset'
              ? ('settled' as const)
              : undefined),
        executionReason:
          policyReleaseHoldReason ||
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
              ? sourceBankAccount && paymentStatus !== 'settled'
                ? ('pending' as const)
                : ('matched' as const)
              : undefined,
        requiresManualReview:
          payload.method === 'digital_asset' ||
          prev.workspaceSettings.requireDocumentLinksForSettlements ||
          Boolean(policyReleaseHoldReason) ||
          settlementExecutionResponse?.execution.processorStatus === 'requires_review' ||
          settlementExecutionResponse?.execution.processorStatus === 'blocked',
        notes:
          payload.notes ||
          policyReleaseHoldReason ||
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
            ? settlementStatus === 'exception'
              ? ('exception' as const)
              : sourceBankAccount && paymentStatus !== 'settled'
                ? ('pending' as const)
                : ('matched' as const)
            : undefined,
        verificationRequired:
          prev.workspaceSettings.requireDocumentLinksForSettlements ||
          Boolean(settlementExecutionResponse) ||
          Boolean(sourceLedgerAccount),
      };
      const paymentRailNamespace =
        payload.method === 'wire'
          ? ('fedwire' as const)
          : payload.method === 'ach'
            ? (sourceBankAccount?.institutionName?.toLowerCase().includes('treasury')
                ? ('federal_ach_green_book' as const)
                : ('commercial_ach' as const))
            : undefined;
      const nextMovementIdentifier = paymentRailNamespace
        ? {
            id: `mid-${stamp}`,
            entityId: entity.id,
            railNamespace: paymentRailNamespace,
            movementType: payload.method === 'wire' ? ('wire' as const) : ('payment' as const),
            linkedPaymentId: paymentId,
            linkedSettlementId: settlementId,
            linkedRemittanceStatementId: nextRemittanceStatement.id,
            primaryIdentifier:
              payload.method === 'wire'
                ? `IMAD-${buildNumericReference(stamp, 20)}`
                : `ACH-${paymentId.toUpperCase()}`,
            secondaryIdentifier:
              payload.method === 'wire'
                ? `OMAD-${buildNumericReference(stamp + 47, 20)}`
                : `BATCH-${(entity.displayName || entity.name).replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase()}-${nextPayment.paymentDate.replaceAll('-', '')}`,
            secCode:
              payload.method === 'ach'
                ? payload.counterpartyType === 'vendor'
                  ? 'CCD'
                  : payload.counterpartyType === 'customer'
                    ? 'PPD'
                    : 'CTX'
                : undefined,
            traceNumber:
              payload.method === 'ach'
                ? `${sourceBankAccount?.routingNumber?.slice(0, 8) || '02100002'}${buildNumericReference(stamp, 7)}`
                : undefined,
            imad:
              payload.method === 'wire'
                ? `IMAD-${buildNumericReference(stamp, 20)}`
                : undefined,
            omad:
              payload.method === 'wire'
                ? `OMAD-${buildNumericReference(stamp + 47, 20)}`
                : undefined,
            routingNumber: sourceBankAccount?.routingNumber,
            effectiveDate: nextPayment.paymentDate,
            returnDeadline:
              payload.method === 'ach'
                ? addDaysToIsoDate(nextPayment.paymentDate, 2)
                : undefined,
            status:
              settlementExecutionResponse?.execution.processorStatus === 'blocked'
                ? ('returned' as const)
                : ('active' as const),
            notes:
              payload.method === 'wire'
                ? 'Fedwire identifiers generated automatically from ERP payment posting.'
                : `ACH movement identifiers generated automatically for ${paymentRailNamespace === 'federal_ach_green_book' ? 'federal' : 'commercial'} rail tracking.`,
          }
        : undefined;
      const nextTaxReportingLink =
        payload.direction === 'outgoing' &&
        payload.counterpartyType === 'vendor' &&
        amount >= 600 &&
        selectedVendor
          ? {
              id: `tax-${stamp}`,
              entityId: entity.id,
              railNamespace: 'irs_reporting' as const,
              linkedPaymentId: paymentId,
              counterpartyName: selectedVendor.name,
              tinLast4: undefined,
              tinMatchStatus: 'not_checked' as const,
              formType: '1099-NEC' as const,
              filingChannel: 'IRIS' as const,
              correctionStatus: 'none' as const,
              status: 'draft' as const,
              notes:
                'Created automatically from a vendor disbursement meeting the current 1099 review threshold. Confirm form type, TIN match, and filing applicability before submission.',
            }
          : undefined;
      const nextReturnEvent =
        nextMovementIdentifier &&
        paymentRailNamespace &&
        settlementExecutionResponse?.execution &&
        (settlementExecutionResponse.execution.processorStatus === 'requires_review' ||
          settlementExecutionResponse.execution.processorStatus === 'blocked')
          ? {
              id: `ret-${stamp}`,
              entityId: entity.id,
              railNamespace: paymentRailNamespace,
              linkedMovementIdentifierId: nextMovementIdentifier.id,
              linkedPaymentId: paymentId,
              linkedSettlementId: settlementId,
              eventDate: nextPayment.paymentDate,
              code:
                settlementExecutionResponse.execution.processorStatus === 'blocked'
                  ? 'BLOCKED_PRE_RELEASE'
                  : 'REVIEW_REQUIRED',
              reason:
                settlementExecutionResponse.execution.executionReason ||
                'Processor flagged the movement before final release; confirm the true rail return or investigation code if one is later issued.',
              correctionStatus: 'pending' as const,
              status:
                settlementExecutionResponse.execution.processorStatus === 'blocked'
                  ? ('exception' as const)
                  : ('open' as const),
              notes:
                'Created automatically from remittance controls because the movement did not clear cleanly on first pass.',
            }
          : undefined;

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
        reconciliations: operationalReconciliation.reconciliations,
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
        movementIdentifiers: nextMovementIdentifier
          ? [nextMovementIdentifier, ...(prev.movementIdentifiers ?? [])]
          : prev.movementIdentifiers,
        returnEvents: nextReturnEvent
          ? [nextReturnEvent, ...(prev.returnEvents ?? [])]
          : prev.returnEvents,
        taxReportingLinks: nextTaxReportingLink
          ? [nextTaxReportingLink, ...(prev.taxReportingLinks ?? [])]
          : prev.taxReportingLinks,
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
        payment.complianceConfirmationStatus === 'pending' ||
        settlement?.processorStatus === 'requires_review' ||
        settlement?.processorStatus === 'blocked'
      ) {
        return prev;
      }

      const railControl = getRemittanceRailControl(prev, paymentId);
      if (hasHardRailBlocks(railControl, ['control_authority'])) {
        setOperationsNotice(
          railControl?.recommendedAction ||
            'Rail controls still show a blocker, so approval stayed in review.'
        );
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
        movementIdentifiers: prev.movementIdentifiers.map((item) =>
          item.linkedPaymentId === paymentId
            ? {
                ...item,
                status: item.status === 'returned' ? item.status : 'active',
                notes:
                  item.notes ||
                  `Approved for release by ${approver} through the ERP remittance desk.`,
              }
            : item
        ),
        taxReportingLinks: prev.taxReportingLinks.map((item) =>
          item.linkedPaymentId === paymentId
            ? {
                ...item,
                notes:
                  item.notes ||
                  `Payment approved by ${approver}; 1099 review remains required before filing.`,
              }
            : item
        ),
      };
    });
  };

  const handleConfirmRemittanceCompliance = (paymentId: string) => {
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
        (payment.method !== 'ach' && payment.method !== 'wire') ||
        payment.complianceConfirmationStatus !== 'pending'
      ) {
        return prev;
      }

      const railControl = getRemittanceRailControl(prev, paymentId);
      if (hasHardRailBlocks(railControl, ['control_authority'])) {
        setOperationsNotice(
          railControl?.recommendedAction ||
            'Rail controls still show a blocker, so compliance confirmation stayed in review.'
        );
        return prev;
      }

      const confirmationNote =
        payment.complianceConfirmationNote ||
        payment.settlementExecution?.executionReason ||
        'Compliance controls confirmed by the acting authority.';

      return {
        ...prev,
        payments: prev.payments.map((item) =>
          item.id === paymentId
            ? {
                ...item,
                complianceConfirmationStatus: 'confirmed',
                complianceConfirmedBy: approver,
                complianceConfirmedAt: approvalAt,
                complianceConfirmationNote: confirmationNote,
                approvalStatus: 'approved',
                approvedBy: approver,
                approvedAt: approvalAt,
                releaseStatus: item.releaseStatus === 'released' ? 'released' : 'ready_to_release',
                settlementExecution: item.settlementExecution
                  ? {
                      ...item.settlementExecution,
                      processorStatus: 'queued',
                      executionReason: `Compliance confirmed by ${approver}. ${confirmationNote}`,
                      executionReference:
                        item.settlementExecution.executionReference || `CONF-${paymentId.toUpperCase()}`,
                      simulatedProcessing: true,
                    }
                  : item.settlementExecution,
                notes: item.notes || `Compliance confirmed by ${approver} for remittance release.`,
              }
            : item
        ),
        settlements: prev.settlements.map((item) =>
          item.id === payment.linkedSettlementId
            ? {
                ...item,
                status: item.status === 'settled' ? item.status : ('routing' as const),
                processorStatus: 'queued',
                verificationStatus: 'pending',
                verificationReference: `Compliance confirmed by ${approver}; ready for remittance release.`,
                requiresManualReview: false,
                notes:
                  item.notes ||
                  `Compliance controls confirmed by ${approver} through the remittance desk.`,
              }
            : item
        ),
        movementIdentifiers: prev.movementIdentifiers.map((item) =>
          item.linkedPaymentId === paymentId
            ? {
                ...item,
                status: item.status === 'returned' ? item.status : 'active',
                notes: `Compliance confirmed by ${approver}. ${item.notes || confirmationNote}`,
              }
            : item
        ),
        taxReportingLinks: prev.taxReportingLinks.map((item) =>
          item.linkedPaymentId === paymentId
            ? {
                ...item,
                notes: `Compliance confirmed by ${approver}; ${item.notes || '1099 review remains required before filing.'}`,
              }
            : item
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
    const liveRailControl = getRemittanceRailControl(data, paymentId);

    if (hasHardRailBlocks(liveRailControl)) {
      setOperationsNotice(
        liveRailControl?.recommendedAction ||
          'Rail controls still show a blocker, so release stayed in the queue.'
      );
      return;
    }
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
      } else if (liveWallet.executionSupport === 'manual_release') {
        setOperationsNotice(
          `Wallet ${liveWallet.name} is in controlled manual-release mode on ${liveWallet.network}, so the payout stayed queued for operator confirmation.`
        );
      } else if (liveWallet.executionSupport === 'read_only') {
        setOperationsNotice(
          `Wallet ${liveWallet.name} is currently read-only for payout execution, so release stayed in controlled queue mode.`
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
        payment.complianceConfirmationStatus === 'pending' ||
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
      const sourceBankAccount = payment.sourceBankAccountId
        ? prev.bankAccounts.find((account) => account.id === payment.sourceBankAccountId)
        : undefined;
      const releaseReconciliation = applyOperationalReconciliationStatus({
        prev,
        bankAccount: sourceBankAccount,
        transactionId: payment.linkedTransactionIds?.[0] || payment.id,
        state: payment.method === 'digital_asset' ? 'pending' : 'matched',
        note:
          payment.method === 'digital_asset'
            ? 'Released to digital-asset settlement controls and waiting for final confirmation.'
            : `Released by ${releaser} through the ERP remittance desk.`,
        preparedBy: 'ERP Release Controls',
      });

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
                autoReconcileStatus: payment.method === 'digital_asset' ? item.autoReconcileStatus : 'matched',
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
        reconciliations: releaseReconciliation.reconciliations,
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
        movementIdentifiers: prev.movementIdentifiers.map((item) =>
          item.linkedPaymentId === paymentId
            ? {
                ...item,
                status:
                  payment.method === 'digital_asset'
                    ? item.status
                    : settlement?.processorStatus === 'blocked'
                      ? 'returned'
                      : 'closed',
                notes:
                  item.notes ||
                  `Released by ${releaser} through the ERP remittance desk.`,
              }
            : item
        ),
        taxReportingLinks: prev.taxReportingLinks.map((item) =>
          item.linkedPaymentId === paymentId
            ? {
                ...item,
                notes:
                  item.notes ||
                  `Payment released by ${releaser}; retain supporting records for filing review.`,
              }
            : item
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
              statementImportPolicy: account.statementImportPolicy ?? 'auto_post_under_threshold',
              statementAutoPostThreshold: account.statementAutoPostThreshold ?? 5000,
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

  const handleAddManualBankAccount = (payload: ManualBankAccountSubmitPayload) => {
    const entity = defaultEntity;
    if (!entity || !payload.institutionName.trim() || !payload.accountName.trim()) {
      return;
    }

    setData((prev) => {
      const stamp = Date.now();
      const openingBalance = Number(payload.openingBalance || 0);
      const linkedLedgerAccountId = payload.linkedLedgerAccountId?.trim();
      const existingLedgerAccount = linkedLedgerAccountId
        ? prev.ledgerAccounts.find((account) => account.id === linkedLedgerAccountId)
        : undefined;
      const generatedLedgerAccount = existingLedgerAccount
        ? undefined
        : {
            id: `led-bank-${stamp}`,
            entityId: entity.id,
            code: `10${String((prev.bankAccounts?.length ?? 0) + 20).padStart(2, '0')}`,
            name: `${payload.accountName.trim()} Cash`,
            accountType: 'asset' as const,
            currency: payload.currency || prev.workspaceSettings.baseCurrency,
            balance: openingBalance,
            remittanceEligible: true,
            remittanceClassification: 'cash' as const,
          };
      const bankAccountId = `bank-${stamp}`;

      return {
        ...prev,
        bankAccounts: [
          {
            id: bankAccountId,
            entityId: entity.id,
            institutionName: payload.institutionName.trim(),
            accountName: payload.accountName.trim(),
            last4: payload.accountNumber ? payload.accountNumber.slice(-4) : undefined,
            accountType: payload.accountType,
            currency: payload.currency || prev.workspaceSettings.baseCurrency,
            status: 'active',
            currentBalance: openingBalance,
            linkedLedgerAccountId: existingLedgerAccount?.id || generatedLedgerAccount?.id,
            onboardingStatus: 'ready',
            connectionType: 'manual_bank',
            liveFeedEnabled: false,
            liveFeedStatus: 'disconnected',
            liveConnectionProvider: 'manual',
            autoReconcileEnabled: true,
            statementImportPolicy: 'review_all',
            statementAutoPostThreshold: 1000,
            routingNumber: payload.routingNumber || undefined,
            accountNumber: payload.accountNumber || undefined,
            achOriginationEnabled: payload.achOriginationEnabled,
            wireEnabled: payload.wireEnabled,
          },
          ...(prev.bankAccounts ?? []),
        ],
        ledgerAccounts: generatedLedgerAccount
          ? [generatedLedgerAccount, ...(prev.ledgerAccounts ?? [])]
          : prev.ledgerAccounts,
      };
    });

    setIsManualBankAccountModalOpen(false);
    setActiveSubsection('bankFeed');
  };

  const handleAddManualBankTransaction = (payload: ManualBankTransactionSubmitPayload) => {
    const entity = defaultEntity;
    if (!entity) {
      return;
    }

    const absoluteAmount = Number(payload.amount || 0);
    if (!payload.bankAccountId || !absoluteAmount || !payload.description.trim()) {
      return;
    }

    setData((prev) => {
      const bankAccount = prev.bankAccounts.find((account) => account.id === payload.bankAccountId);
      if (!bankAccount) {
        return prev;
      }

      const stamp = Date.now();
      const transactionId = `txn-${stamp}`;
      const journalId = `je-${stamp}`;
      const tokenId = `tok-${stamp}`;
      const entryId = `bfe-${stamp}`;
      const linkedLedgerAccount =
        (payload.ledgerAccountId
          ? prev.ledgerAccounts.find((account) => account.id === payload.ledgerAccountId)
          : undefined) ||
        (bankAccount.linkedLedgerAccountId
          ? prev.ledgerAccounts.find((account) => account.id === bankAccount.linkedLedgerAccountId)
          : undefined);
      const autoReconcileState = payload.autoReconcile ? 'matched' : 'pending';
      const operationalReconciliation = applyOperationalReconciliationStatus({
        prev,
        bankAccount,
        transactionId,
        state: autoReconcileState,
        note:
          payload.memo?.trim() ||
          `Manual bank transaction entered for ${bankAccount.accountName}.`,
        preparedBy: 'Manual Bank Entry',
      });
      const nextToken =
        payload.verificationMode === 'internal_control_token'
          ? {
              id: tokenId,
              entityId: entity.id,
              subjectType: 'transaction' as const,
              subjectId: transactionId,
              label: 'Manual Bank Entry Control Token',
              status: payload.autoReconcile ? ('verified' as const) : ('issued' as const),
              tokenStandard: 'internal-proof',
              tokenReference: `MBE-${stamp}`,
              issuedAt: new Date().toISOString(),
              verifiedAt: payload.autoReconcile ? new Date().toISOString() : undefined,
              proofReference:
                'Issued automatically from manual bank transaction entry controls.',
              notes: payload.memo?.trim() || payload.description.trim(),
            }
          : undefined;
      const nextTransaction = {
        id: transactionId,
        entityId: entity.id,
        type:
          payload.transactionType === 'income'
            ? ('income' as const)
            : payload.transactionType === 'deposit'
              ? ('deposit' as const)
              : payload.transactionType === 'withdrawal'
                ? ('withdrawal' as const)
                : ('expense' as const),
        title: payload.description.trim(),
        amount: absoluteAmount,
        currency: bankAccount.currency,
        date: payload.postedDate,
        status: 'posted' as const,
        linkedLedgerAccountIds: linkedLedgerAccount ? [linkedLedgerAccount.id] : undefined,
        linkedJournalEntryIds: [journalId],
        linkedTokenIds: nextToken ? [nextToken.id] : undefined,
        notes: payload.memo?.trim() || payload.counterpartyLabel?.trim() || undefined,
      };
      const nextJournal = {
        id: journalId,
        entityId: entity.id,
        entryNumber: buildEntityScopedNumber(
          entity,
          'journal',
          '',
          String(getEntityNextSequence(entity, 'journal')),
        ),
        entryDate: payload.postedDate,
        memo: payload.memo?.trim() || payload.description.trim(),
        debitAccount:
          payload.direction === 'credit'
            ? `${linkedLedgerAccount?.code || '1000'} ${linkedLedgerAccount?.name || 'Operating Cash'}`
            : payload.transactionType === 'expense'
              ? '6850 Operating Expense Clearing'
              : '2100 Clearing Payables',
        creditAccount:
          payload.direction === 'credit'
            ? payload.transactionType === 'income'
              ? '4000 Operating Income'
              : '2300 Unapplied Cash'
            : `${linkedLedgerAccount?.code || '1000'} ${linkedLedgerAccount?.name || 'Operating Cash'}`,
        amount: absoluteAmount,
        status: 'posted' as const,
        source: 'system' as const,
        linkedTransactionIds: [transactionId],
        autoReconcileStatus: payload.autoReconcile ? ('matched' as const) : ('pending' as const),
        verificationRequired: payload.verificationMode !== 'bank_confirmation',
      };
      const nextFeedEntry = {
        id: entryId,
        entityId: entity.id,
        bankAccountId: bankAccount.id,
        sourceProvider: 'manual' as const,
        externalTransactionId: `manual-${stamp}`,
        postedDate: payload.postedDate,
        amount: payload.direction === 'credit' ? absoluteAmount : -absoluteAmount,
        direction: payload.direction,
        description: payload.description.trim(),
        merchantName: payload.counterpartyLabel?.trim() || payload.description.trim(),
        importedAt: new Date().toISOString(),
        status: payload.autoReconcile ? ('reconciled' as const) : ('posted' as const),
        linkedTransactionId: transactionId,
        linkedJournalEntryId: journalId,
        linkedReconciliationId: operationalReconciliation.linkedReconciliationId,
        linkedTokenIds: nextToken ? [nextToken.id] : undefined,
        verificationStatus:
          payload.verificationMode === 'bank_confirmation'
            ? ('verified' as const)
            : payload.autoReconcile
              ? ('verified' as const)
              : ('pending' as const),
        notes: payload.memo?.trim() || undefined,
      };

      return {
        ...prev,
        entities: prev.entities.map((item) =>
          item.id === entity.id ? incrementEntitySequence(item, 'journal') : item,
        ),
        bankAccounts: prev.bankAccounts.map((account) =>
          account.id === bankAccount.id
            ? {
                ...account,
                currentBalance: Number(
                  (
                    (account.currentBalance ?? 0) +
                    (payload.direction === 'credit' ? absoluteAmount : -absoluteAmount)
                  ).toFixed(2),
                ),
              }
            : account,
        ),
        ledgerAccounts: linkedLedgerAccount
          ? prev.ledgerAccounts.map((account) =>
              account.id === linkedLedgerAccount.id
                ? {
                    ...account,
                    balance: Number(
                      (
                        account.balance +
                        (payload.direction === 'credit' ? absoluteAmount : -absoluteAmount)
                      ).toFixed(2),
                    ),
                  }
                : account,
            )
          : prev.ledgerAccounts,
        transactions: [nextTransaction, ...(prev.transactions ?? [])],
        journalEntries: [nextJournal, ...(prev.journalEntries ?? [])],
        bankFeedEntries: [nextFeedEntry, ...(prev.bankFeedEntries ?? [])],
        reconciliations: operationalReconciliation.reconciliations,
        tokens: nextToken ? [nextToken, ...(prev.tokens ?? [])] : prev.tokens,
      };
    });

    setIsManualBankTransactionModalOpen(false);
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

  const handleAddEmployee = (payload: EmployeeSubmitPayload) => {
    const entity = defaultPayrollEntity;
    if (!entity || !payload.fullName.trim() || !payload.email.trim()) {
      return;
    }

    setData((prev) => ({
      ...prev,
      employees: [
        {
          id: `emp-${Date.now()}`,
          entityId: entity.id,
          fullName: payload.fullName.trim(),
          email: payload.email.trim(),
          phone: payload.phone?.trim() || undefined,
          title: payload.title?.trim() || undefined,
          department: payload.department?.trim() || undefined,
          status: 'active',
          employeeType: payload.employeeType,
          compensationType: payload.compensationType,
          paySchedule: payload.paySchedule,
          annualSalary: payload.annualSalary ? Number(payload.annualSalary) : undefined,
          hourlyRate: payload.hourlyRate ? Number(payload.hourlyRate) : undefined,
          defaultHoursPerPeriod: payload.defaultHoursPerPeriod
            ? Number(payload.defaultHoursPerPeriod)
            : undefined,
          startDate: payload.startDate || undefined,
          linkedDocumentIds: [],
          notes: payload.notes?.trim() || undefined,
        },
        ...(prev.employees ?? []),
      ],
    }));

    setIsEmployeeModalOpen(false);
    setActiveSubsection('payroll');
  };

  const handleDirectDepositRequestSubmit = async (payload: DirectDepositRequestSubmitPayload) => {
    if (!payload.employeeId) {
      return;
    }

    const employee = employees.find((item) => item.id === payload.employeeId);
    if (!employee) {
      return;
    }

    const now = new Date().toISOString();
    const entity = data.entities.find((item) => item.id === employee.entityId) || defaultPayrollEntity;
    if (!entity) {
      return;
    }

    const requestId = `dda-${Date.now()}`;
    const tokenId = `tok-${requestId}`;
    const requestDocumentId = `doc-${requestId}`;

    let returnedFormDocument: DocumentRecord | null = null;
    if (payload.uploadedFile) {
      returnedFormDocument = await persistUploadDocument({
        entityId: entity.id,
        folder: 'documents',
        title: `Direct Deposit Return - ${employee.fullName}`,
        summary: 'Returned signed direct deposit authorization retained to the payroll profile.',
        sourceRecordType: 'direct_deposit_request',
        sourceRecordId: requestId,
        file: payload.uploadedFile,
        date: now.slice(0, 10),
        storageOwner: 'clearflow_retained',
        retentionClass: 'payroll',
        externalStorageStatus: 'not_applicable',
        storageNotes:
          'Returned payroll banking authorization retained by ClearFlow for payroll records and compliance support.',
      });
    }

    const requestDocument: DocumentRecord = {
      id: requestDocumentId,
      entityId: entity.id,
      title: `Direct Deposit Authorization Request - ${employee.fullName}`,
      category: 'financial',
      date: now.slice(0, 10),
      status: 'final',
      sourceRecordType: 'direct_deposit_request',
      sourceRecordId: requestId,
      linkedTokenIds: [tokenId],
      summary: 'Payroll direct deposit request packet generated for employee onboarding.',
      storageOwner: 'user_owned',
      retentionClass: 'payroll',
      externalStorageTarget: 'google_drive',
      externalStorageStatus: 'ready',
      storageNotes:
        'Payroll onboarding packet generated for the workspace and ready for user-owned Google Drive routing.',
    };

    const requestToken: TokenRecord = {
      id: tokenId,
      entityId: entity.id,
      subjectType: 'document',
      subjectId: returnedFormDocument?.id || requestDocumentId,
      label: `Direct Deposit Authorization - ${employee.fullName}`,
      status: payload.uploadedFile ? 'verified' : 'issued',
      tokenStandard: 'internal-proof',
      tokenReference: `DDA-${Date.now()}`,
      issuedAt: now,
      verifiedAt: payload.uploadedFile ? now : undefined,
      proofReference: payload.uploadedFile
        ? 'Signed direct deposit return retained to employee profile.'
        : 'Authorization request issued through payroll onboarding controls.',
      notes: payload.notes?.trim() || undefined,
    };

    const requestRecord = {
      id: requestId,
      entityId: entity.id,
      employeeId: employee.id,
      requestEmail: payload.requestEmail.trim() || employee.email,
      status: payload.uploadedFile
        ? (payload.routingNumber && payload.accountNumber ? 'verified' : 'returned')
        : payload.sendByEmail
          ? 'sent'
          : 'draft',
      formDeliveryMethod: payload.sendByEmail ? ('email' as const) : ('manual' as const),
      requestedAt: now,
      returnedAt: payload.uploadedFile ? now : undefined,
      verifiedAt:
        payload.uploadedFile && payload.routingNumber && payload.accountNumber ? now : undefined,
      requestTokenId: tokenId,
      linkedDocumentIds: [
        requestDocument.id,
        ...(returnedFormDocument ? [returnedFormDocument.id] : []),
      ],
      routingLast4: payload.routingNumber ? payload.routingNumber.slice(-4) : undefined,
      accountLast4: payload.accountNumber ? payload.accountNumber.slice(-4) : undefined,
      accountType: payload.accountType,
      signatureName: payload.signatureName?.trim() || undefined,
      notes: payload.notes?.trim() || undefined,
    };

    if (payload.sendByEmail && payload.requestEmail.trim() && typeof window !== 'undefined') {
      const subject = encodeURIComponent(`Direct Deposit Authorization - ${entity.displayName || entity.name}`);
      const body = encodeURIComponent(
        `Hello ${employee.fullName},\n\nPlease complete and return your direct deposit authorization for payroll setup in ClearFlow.\n\nEntity: ${entity.displayName || entity.name}\nWorker: ${employee.fullName}\nReference: ${requestId}\n\nOnce signed, return the completed form so it can be retained to your payroll profile.\n`
      );
      window.open(`mailto:${payload.requestEmail.trim()}?subject=${subject}&body=${body}`, '_blank');
    }

    setData((prev) => ({
      ...prev,
      employees: prev.employees.map((item) =>
        item.id === employee.id
          ? {
              ...item,
              directDepositRequestId: requestId,
              linkedDocumentIds: Array.from(
                new Set([
                  ...(item.linkedDocumentIds ?? []),
                  requestDocument.id,
                  ...(returnedFormDocument ? [returnedFormDocument.id] : []),
                ])
              ),
            }
          : item
      ),
      directDepositAuthorizations: [requestRecord, ...(prev.directDepositAuthorizations ?? [])],
      documents: [
        requestDocument,
        ...(returnedFormDocument ? [returnedFormDocument] : []),
        ...(prev.documents ?? []),
      ],
      tokens: [requestToken, ...(prev.tokens ?? [])],
    }));

    setOperationsNotice(
      payload.uploadedFile
        ? `Retained signed direct deposit form for ${employee.fullName} and linked it into payroll.`
        : `Prepared a direct deposit authorization request for ${employee.fullName}.`
    );
    setIsDirectDepositModalOpen(false);
    setActiveSubsection('payroll');
  };

  const handleToggleBankFeedRule = (ruleId: string) => {
    setData((prev) => ({
      ...prev,
      bankFeedRules: prev.bankFeedRules.map((rule) =>
        rule.id === ruleId ? { ...rule, active: !rule.active } : rule
      ),
    }));
  };

  const handleUpdateBankImportPolicy = (
    bankAccountId: string,
    policy: NonNullable<CoreDataBundle['bankAccounts'][number]['statementImportPolicy']>,
    threshold?: number,
  ) => {
    setData((prev) => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((account) =>
        account.id === bankAccountId
          ? {
              ...account,
              statementImportPolicy: policy,
              statementAutoPostThreshold:
                policy === 'auto_post_under_threshold'
                  ? threshold ?? account.statementAutoPostThreshold ?? 2500
                  : threshold ?? account.statementAutoPostThreshold,
            }
          : account,
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
    const packetHtml = buildInvoicePacketHtml({
      invoice,
      customer,
      entity,
    });

    const response = await queueInvoiceExport({
      invoiceId: invoice.id,
      entityId: invoice.entityId,
      invoiceNumber: invoice.invoiceNumber,
    });

    const exportFile = new File([packetHtml], packetDownload.fileName, {
      type: 'text/html;charset=utf-8',
    });
    const exportFileMetadata = await saveDocumentFile(`invoice-export-${invoice.id}`, exportFile);
    const shouldAutoRouteToDrive =
      data.workspaceSettings.autoRouteUserOwnedDocumentsToDrive && auth.hasDriveAccess;
    const driveRoutingResult = shouldAutoRouteToDrive
      ? await auth.routeDocumentToDrive({
          sourceFileId: exportFileMetadata.sourceFileId,
          fileName: exportFileMetadata.fileName,
        })
      : null;

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
        fileName: exportFileMetadata.fileName,
        mimeType: exportFileMetadata.mimeType,
        sizeBytes: exportFileMetadata.sizeBytes,
        uploadedAt: exportFileMetadata.uploadedAt,
        sourceFileId: exportFileMetadata.sourceFileId,
        sourceRecordType: 'document',
        sourceRecordId: invoiceId,
        vaultPath: buildVaultPath(invoice.entityId, 'documents', exportFileMetadata.fileName),
        summary: `Export packet prepared for ${invoice.invoiceNumber}.`,
        storageOwner: 'user_owned',
        retentionClass: 'financial_evidence',
        storageNotes:
          'Invoice export packet retained in the vault and ready for user-owned Google Drive routing.',
        externalStorageTarget: 'google_drive',
        externalStorageStatus: driveRoutingResult?.success
          ? 'routed'
          : shouldAutoRouteToDrive
            ? 'error'
            : 'ready',
        externalStorageFileId: driveRoutingResult?.success ? driveRoutingResult.fileId : undefined,
        externalStorageLabel: driveRoutingResult?.success
          ? 'Auto-routed to Google Drive'
          : shouldAutoRouteToDrive
            ? driveRoutingResult?.error || 'Automatic Google Drive routing failed'
            : 'Ready for Google Drive routing',
        externalStorageRoutedAt: driveRoutingResult?.success ? new Date().toISOString() : undefined,
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

    setData((prev) => {
      const currentReconciliation = prev.reconciliations.find((item) => item.id === reconciliationId);
      const bankAccount = prev.bankAccounts.find((item) => item.id === reconciliation.bankAccountId);
      const entity = currentReconciliation
        ? prev.entities.find((item) => item.id === currentReconciliation.entityId)
        : undefined;

      if (!currentReconciliation || !bankAccount || !entity) {
        return prev;
      }

      const importPolicy = bankAccount.statementImportPolicy ?? 'review_all';
      const importThreshold = bankAccount.statementAutoPostThreshold ?? 2500;
      const absoluteHoldThreshold = prev.workspaceSettings.statementImportAbsoluteHoldThreshold;
      const suspiciousKeywords = prev.workspaceSettings.statementImportHighRiskKeywords ?? [];
      let journalSequenceOffset = 0;
      const autoImportedTransactions: CoreDataBundle['transactions'] = [];
      const autoImportedJournals: CoreDataBundle['journalEntries'] = [];
      const autoImportedFeedEntries: CoreDataBundle['bankFeedEntries'] = [];
      const autoImportedTokens: CoreDataBundle['tokens'] = [];
      const nextClearedTransactionIds = [...(currentReconciliation.clearedTransactionIds ?? [])];
      const nextMatchedLineIds: string[] = [];
      const nextUnmatchedLineIds: string[] = [];

      const nextParsedLines = parsedStatement.lines.map((line) => {
        if (line.matchStatus === 'suggested' && line.suggestedTransactionIds?.length) {
          nextMatchedLineIds.push(line.id);
          nextClearedTransactionIds.push(...line.suggestedTransactionIds);
          return {
            ...line,
            matchStatus: 'matched' as const,
            resolvedAt: new Date().toISOString(),
            notes:
              line.notes ||
              'Matched automatically from existing ERP payment and transaction history during statement import.',
          };
        }

        if (!line.amount) {
          nextUnmatchedLineIds.push(line.id);
          return line;
        }

        const shouldAutoPostLine =
          importPolicy === 'auto_post_all'
            ? true
            : importPolicy === 'auto_post_credits_only'
              ? line.direction === 'credit'
              : importPolicy === 'auto_post_under_threshold'
                ? Math.abs(line.amount) <= importThreshold
                : false;
        const hitsHighRiskKeyword = suspiciousKeywords.some((keyword) =>
          line.description.toLowerCase().includes(keyword.toLowerCase()),
        );
        const exceedsAbsoluteHoldThreshold = Math.abs(line.amount) >= absoluteHoldThreshold;

        if (!shouldAutoPostLine || hitsHighRiskKeyword || exceedsAbsoluteHoldThreshold) {
          nextUnmatchedLineIds.push(line.id);
          return {
            ...line,
            matchStatus: 'exception' as const,
            notes:
              line.notes ||
              hitsHighRiskKeyword
                ? 'Held for review because the description hit a high-risk keyword rule.'
                : exceedsAbsoluteHoldThreshold
                  ? `Held for review because the amount exceeded the hard stop threshold of ${formatCurrency(
                      absoluteHoldThreshold,
                      bankAccount.currency,
                    )}.`
                  : `Held for review by ${importPolicy === 'review_all' ? 'account policy' : 'statement import hardening controls'}.`,
          };
        }

        const existingImportedEntry = (prev.bankFeedEntries ?? []).find(
          (entry) =>
            entry.bankAccountId === bankAccount.id &&
            entry.postedDate === line.postedDate &&
            entry.description === line.description &&
            Number(entry.amount.toFixed(2)) === Number(line.amount.toFixed(2)),
        );

        if (existingImportedEntry?.linkedTransactionId) {
          nextMatchedLineIds.push(line.id);
          nextClearedTransactionIds.push(existingImportedEntry.linkedTransactionId);
          return {
            ...line,
            matchStatus: 'matched' as const,
            suggestedTransactionIds: [existingImportedEntry.linkedTransactionId],
            linkedJournalEntryId: existingImportedEntry.linkedJournalEntryId,
            resolvedAt: new Date().toISOString(),
            notes:
              'Matched to an existing imported accounting movement during statement load.',
          };
        }

        const stamp = Date.now() + journalSequenceOffset;
        journalSequenceOffset += 1;
        const transactionId = `txn-stmt-${stamp}`;
        const journalId = `je-stmt-${stamp}`;
        const tokenId = `tok-stmt-${stamp}`;
        const linkedLedgerAccount =
          (bankAccount.linkedLedgerAccountId
            ? prev.ledgerAccounts.find((item) => item.id === bankAccount.linkedLedgerAccountId)
            : undefined) ||
          prev.ledgerAccounts.find(
            (item) =>
              item.entityId === entity.id &&
              item.remittanceClassification === 'cash',
          );
        const nextToken =
          prev.workspaceSettings.requireDocumentLinksForSettlements
            ? {
                id: tokenId,
                entityId: entity.id,
                subjectType: 'transaction' as const,
                subjectId: transactionId,
                label: 'Statement Import Verification Token',
                status: 'verified' as const,
                tokenStandard: 'internal-proof',
                tokenReference: `STM-${stamp}`,
                issuedAt: new Date().toISOString(),
                verifiedAt: new Date().toISOString(),
                proofReference:
                  'Verified automatically from statement import and reconciliation parsing controls.',
                notes: line.description,
              }
            : undefined;

        autoImportedTransactions.push({
          id: transactionId,
          entityId: entity.id,
          type: line.direction === 'credit' ? 'deposit' : 'withdrawal',
          title: line.description,
          amount: Math.abs(line.amount),
          currency: bankAccount.currency,
          date: line.postedDate,
          status: 'posted',
          linkedLedgerAccountIds: linkedLedgerAccount ? [linkedLedgerAccount.id] : undefined,
          linkedJournalEntryIds: [journalId],
          linkedTokenIds: nextToken ? [nextToken.id] : undefined,
          notes: 'Auto-created from statement import into the operational ledger.',
        });
        autoImportedJournals.push({
          id: journalId,
          entityId: entity.id,
          entryNumber: buildEntityScopedNumber(
            entity,
            'journal',
            '',
            String(getEntityNextSequence(entity, 'journal') + journalSequenceOffset - 1),
          ),
          entryDate: line.postedDate,
          memo: `Statement import: ${line.description}`,
          debitAccount:
            line.direction === 'credit'
              ? `${linkedLedgerAccount?.code || '1000'} ${linkedLedgerAccount?.name || 'Operating Cash'}`
              : '6850 Statement Import Expense Clearing',
          creditAccount:
            line.direction === 'credit'
              ? '2300 Unapplied Cash'
              : `${linkedLedgerAccount?.code || '1000'} ${linkedLedgerAccount?.name || 'Operating Cash'}`,
          amount: Math.abs(line.amount),
          status: 'posted',
          source: 'system',
          linkedTransactionIds: [transactionId],
          autoReconcileStatus: 'matched',
          verificationRequired: Boolean(nextToken),
        });
        autoImportedFeedEntries.push({
          id: `bfe-stmt-${stamp}`,
          entityId: entity.id,
          bankAccountId: bankAccount.id,
          sourceProvider: 'manual',
          externalTransactionId: `stmt-${reconciliationId}-${line.id}`,
          postedDate: line.postedDate,
          description: line.description,
          merchantName: line.description,
          amount: line.amount,
          direction: line.direction,
          importedAt: new Date().toISOString(),
          status: 'reconciled',
          linkedTransactionId: transactionId,
          linkedJournalEntryId: journalId,
          linkedReconciliationId: reconciliationId,
          linkedTokenIds: nextToken ? [nextToken.id] : undefined,
          verificationStatus: nextToken ? 'verified' : 'verified',
          notes: 'Created automatically from statement import.',
        });
        if (nextToken) {
          autoImportedTokens.push(nextToken);
        }
        nextMatchedLineIds.push(line.id);
        nextClearedTransactionIds.push(transactionId);

        return {
          ...line,
          matchStatus: 'matched' as const,
          suggestedTransactionIds: [transactionId],
          linkedJournalEntryId: journalId,
          resolvedAt: new Date().toISOString(),
          notes:
            'Auto-posted into accounting from statement import and cleared into reconciliation.',
        };
      });

      return {
        ...prev,
        entities: prev.entities.map((item) =>
          item.id === entity.id
            ? {
                ...incrementEntitySequence(item, 'journal'),
                numbering: item.numbering
                  ? {
                      ...item.numbering,
                      nextJournalSequence:
                        getEntityNextSequence(item, 'journal') + journalSequenceOffset,
                    }
                  : item.numbering,
              }
            : item,
        ),
        bankAccounts: prev.bankAccounts.map((item) =>
          item.id === bankAccount.id
            ? {
                ...item,
                currentBalance: statementEndingBalance,
              }
            : item,
        ),
        ledgerAccounts: prev.ledgerAccounts.map((item) => {
          const importedDelta = autoImportedTransactions
            .filter((transaction) => transaction.linkedLedgerAccountIds?.includes(item.id))
            .reduce(
              (sum, transaction) =>
                sum +
                (transaction.type === 'deposit' ? transaction.amount : -transaction.amount),
              0,
            );

          return importedDelta
            ? {
                ...item,
                balance: Number((item.balance + importedDelta).toFixed(2)),
              }
            : item;
        }),
        transactions: [...autoImportedTransactions, ...(prev.transactions ?? [])],
        journalEntries: [...autoImportedJournals, ...(prev.journalEntries ?? [])],
        bankFeedEntries: [...autoImportedFeedEntries, ...(prev.bankFeedEntries ?? [])],
        tokens: [...autoImportedTokens, ...(prev.tokens ?? [])],
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
                parsedStatementLines: nextParsedLines,
                clearedTransactionIds: Array.from(new Set(nextClearedTransactionIds)),
                matchedStatementLineIds: Array.from(new Set(nextMatchedLineIds)),
                unmatchedStatementLineIds: Array.from(new Set(nextUnmatchedLineIds)),
                statementReviewStatus: nextUnmatchedLineIds.length
                  ? 'needs_review'
                  : nextParsedLines.length
                    ? 'ready_to_close'
                    : item.statementReviewStatus ?? 'not_imported',
                closeApprovalStatus: 'pending',
                controllerSignoffName: undefined,
                controllerSignoffAt: undefined,
                closeOverrideReason: undefined,
                status: nextUnmatchedLineIds.length ? 'in_review' : 'in_review',
                notes: [item.notes, parsedStatement.summary].filter(Boolean).join(' | '),
              }
            : item,
        ),
        documents: statementDocument
          ? [statementDocument, ...(prev.documents ?? [])]
          : prev.documents,
      };
    });
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

    setData((prev) => {
      const existingConnection = (prev.entityConnections ?? []).find(
        (connection) =>
          connection.ownerEntityId === fromEntity.id &&
          connection.connectedEntityId === toEntity.id &&
          connection.connectionType === 'internal_entity',
      );
      const existingRail = existingConnection
        ? (prev.creditRails ?? []).find((rail) => rail.entityConnectionId === existingConnection.id)
        : undefined;
      const connectionId = existingConnection?.id ?? `conn-${stamp}`;
      const railId = existingRail?.id ?? `rail-${stamp}`;
      const existingRailOutstanding = Number(existingRail?.outstandingExposure ?? 0);
      const existingRailLimit = Number(existingRail?.exposureLimit ?? 0);
      const nextOutstandingExposure = existingRailOutstanding + amount;

      return {
        ...prev,
        entityConnections: existingConnection
          ? prev.entityConnections.map((connection) =>
              connection.id === existingConnection.id
                ? {
                    ...connection,
                    status: 'active',
                    notes:
                      connection.notes ||
                      'Internal entity connection created automatically from intercompany settlement activity.',
                  }
                : connection,
            )
          : [
              {
                id: connectionId,
                ownerEntityId: fromEntity.id,
                connectionName: `${fromEntity.displayName || fromEntity.name} <> ${toEntity.displayName || toEntity.name}`,
                connectionType: 'internal_entity',
                relationshipClass: 'shared_control',
                status: 'active',
                connectedEntityId: toEntity.id,
                defaultSettlementPath: 'internal_ledger',
                defaultCurrency: 'USD',
                validationMode: 'strict',
                requireVerificationTokens: true,
                requireComplianceValidation: false,
                reserveBackedPreferred: true,
                notes:
                  'Created automatically from ERP intercompany settlement activity.',
              },
              ...(prev.entityConnections ?? []),
            ],
        creditRails: existingRail
          ? prev.creditRails.map((rail) =>
              rail.id === existingRail.id
                ? {
                    ...rail,
                    status: rail.status === 'blocked' ? 'watch' : rail.status,
                    outstandingExposure: nextOutstandingExposure,
                    availableCredit:
                      existingRailLimit > 0
                        ? Math.max(existingRailLimit - nextOutstandingExposure, 0)
                        : rail.availableCredit,
                  }
                : rail,
            )
          : [
              {
                id: railId,
                ownerEntityId: fromEntity.id,
                entityConnectionId: connectionId,
                railName: `${fromEntity.displayName || fromEntity.name} Internal Credit Rail`,
                railType: 'intercompany_credit',
                status: 'active',
                settlementPath: 'internal_ledger',
                dischargeMethod: 'internal_ledger_credit',
                currency: 'USD',
                exposureLimit: amount * 5,
                outstandingExposure: amount,
                availableCredit: amount * 4,
                autoMirrorIntercompanyEntries: true,
                autoIssueTokens: true,
                reserveBacked: true,
                notes: 'Created automatically from ERP intercompany transfer posting.',
              },
              ...(prev.creditRails ?? []),
            ],
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
          notes: 'Origin half of ERP-posted intercompany transfer under the linked internal credit rail.',
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
          notes: 'Destination half of ERP-posted intercompany transfer under the linked internal credit rail.',
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
          linkedEntityConnectionId: connectionId,
          linkedCreditRailId: railId,
          notes: `Mirrored origin payment to ${toEntity.name} through the linked internal credit rail.`,
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
          linkedEntityConnectionId: connectionId,
          linkedCreditRailId: railId,
          notes: `Mirrored receipt from ${fromEntity.name} through the linked internal credit rail.`,
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
          linkedEntityConnectionId: connectionId,
          linkedCreditRailId: railId,
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
          linkedEntityConnectionId: connectionId,
          linkedCreditRailId: railId,
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
          linkedEntityConnectionId: connectionId,
          linkedCreditRailId: railId,
          memo,
        },
        ...(prev.interEntityTransfers ?? []),
      ],
    }});

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
            payments={payments}
            expenses={expenses}
            receipts={receipts}
            employees={employees}
            directDepositAuthorizations={directDepositAuthorizations}
            taxReportingLinks={taxReportingLinks}
            documents={data.documents}
            obligations={obligations}
            complianceTags={complianceTags}
            movementIdentifiers={movementIdentifiers}
            returnEvents={returnEvents}
            railControls={remittanceRailControls}
            onNavigate={navigateToHash}
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

      case 'presentments':
        return (
          <EditableRecordSection
            title="Coupon Presentments"
            description="Photo, upload, or manual coupon presentments that post directly into remittance, settlement, and ERP journals."
            emptyMessage="No coupon or performance presentments recorded yet."
            records={couponPresentments}
            getTitle={(record) => record.title ?? record.id}
            getSubtitle={(record) =>
              `${record.status} | ${record.dischargeMethod} | ${formatCurrency(record.amount, record.currency)}`
            }
            onSave={(nextRecord) =>
              setData((prev) => ({
                ...prev,
                couponPresentments: updateCollectionRecord(prev.couponPresentments, nextRecord),
              }))
            }
          />
        );

      case 'railOps':
        return (
          <div style={{ display: 'grid', gap: 16 }}>
            <PageSection
              title="Settlement Railing Board"
              description="Unified release posture for outgoing remittances across proof, traceability, exception, and reconciliation controls."
            >
              <div style={{ display: 'grid', gap: 12 }}>
                {remittanceRailControls.length === 0 ? (
                  <div style={{ color: '#d1d5db' }}>
                    No remittance rail controls are active yet.
                  </div>
                ) : (
                  remittanceRailControls.map((control) => (
                    <div
                      key={control.paymentId}
                      style={{
                        border: '1px solid rgba(148,163,184,0.2)',
                        borderRadius: 12,
                        padding: 14,
                        background: 'rgba(15,23,42,0.45)',
                        color: '#e5e7eb',
                        display: 'grid',
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ display: 'grid', gap: 4 }}>
                          <div style={{ fontWeight: 700 }}>
                            {control.executionLabel} | {control.railNamespace}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: 13 }}>
                            payment {control.paymentId} | settlement {control.settlementId || 'pending'}
                          </div>
                        </div>
                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: '1px solid rgba(96,165,250,0.35)',
                            background:
                              control.overallStatus === 'ready'
                                ? 'rgba(15,118,110,0.22)'
                                : control.overallStatus === 'watch'
                                  ? 'rgba(8,47,73,0.28)'
                                  : 'rgba(120,53,15,0.2)',
                            color:
                              control.overallStatus === 'ready'
                                ? '#ccfbf1'
                                : control.overallStatus === 'watch'
                                  ? '#bae6fd'
                                  : '#fde68a',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {control.overallStatus}
                        </div>
                      </div>
                      <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                        {control.recommendedAction}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                          gap: 10,
                          color: '#cbd5e1',
                          fontSize: 13,
                        }}
                      >
                        <div>{control.passCount}/{control.checks.length} controls passing</div>
                        <div>{control.movementIdentifierCount} linked movement identifiers</div>
                        <div>{control.openReturnCount} open return events</div>
                        <div>{control.openReclamationCount} open reclamation events</div>
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {control.checks.map((check) => (
                          <div
                            key={`${control.paymentId}-${check.id}`}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 10,
                              border: '1px solid rgba(148,163,184,0.2)',
                              background: 'rgba(8,13,27,0.48)',
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>
                              {check.label} | {check.status}
                            </div>
                            <div style={{ color: '#94a3b8', marginTop: 4 }}>{check.detail}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PageSection>
            <EditableRecordSection
              title="Movement Identifiers"
              description="ACH traces, Fedwire IMAD/OMAD, Treasury references, and IRS-linked movement IDs."
              emptyMessage="No rail identifiers recorded yet."
              records={movementIdentifiers}
              getTitle={(record) => record.primaryIdentifier}
              getSubtitle={(record) =>
                `${record.railNamespace} | ${record.movementType} | ${record.status}`
              }
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  movementIdentifiers: updateCollectionRecord(prev.movementIdentifiers, nextRecord),
                }))
              }
            />
            <EditableRecordSection
              title="Return Events"
              description="Commercial or federal ACH return and change events tied back to the original movement."
              emptyMessage="No return events recorded yet."
              records={returnEvents}
              getTitle={(record) => `${record.code} - ${record.reason}`}
              getSubtitle={(record) =>
                `${record.railNamespace} | ${record.status} | correction ${record.correctionStatus}`
              }
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  returnEvents: updateCollectionRecord(prev.returnEvents, nextRecord),
                }))
              }
            />
            <EditableRecordSection
              title="Reclamation Events"
              description="Gold Book-style Treasury check reclamation controls and follow-up status."
              emptyMessage="No reclamation events recorded yet."
              records={reclamationEvents}
              getTitle={(record) => record.claimNumber || record.id}
              getSubtitle={(record) =>
                `${record.railNamespace} | ${record.reclamationType} | ${record.status}`
              }
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  reclamationEvents: updateCollectionRecord(prev.reclamationEvents, nextRecord),
                }))
              }
            />
            <EditableRecordSection
              title="IRS Reporting Links"
              description="TIN match status, form type, TCC, and submission tracking tied back to movement records."
              emptyMessage="No IRS reporting links recorded yet."
              records={taxReportingLinks}
              getTitle={(record) => `${record.counterpartyName} ${record.formType || 'reporting link'}`}
              getSubtitle={(record) =>
                `${record.railNamespace} | ${record.status} | TIN ${record.tinMatchStatus}`
              }
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  taxReportingLinks: updateCollectionRecord(prev.taxReportingLinks, nextRecord),
                }))
              }
            />
          </div>
        );

      case 'payments':
        return (
          <RemittanceOperationsWorkspace
            payments={payments}
            customers={customers}
            vendors={vendors}
            railControls={remittanceRailControls}
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
            onConfirmCompliance={handleConfirmRemittanceCompliance}
            onApprovePayment={handleApproveOutgoingPayment}
            onReleasePayment={handleReleaseOutgoingPayment}
            onConfirmWalletSettlement={handleConfirmWalletSettlement}
            operationsNotice={operationsNotice}
          />
        );

      case 'recurring':
        return (
          <RecurringCommitmentsWorkspace
            entities={data.entities}
            payments={
              defaultEntity
                ? payments.filter((item) => item.entityId === defaultEntity.id)
                : payments
            }
            obligations={
              defaultEntity
                ? obligations.filter((item) => item.entityId === defaultEntity.id)
                : obligations
            }
            onUpdatePayment={(paymentId, updater) =>
              setData((prev) => ({
                ...prev,
                payments: prev.payments.map((item) =>
                  item.id === paymentId ? updater(item) : item,
                ),
              }))
            }
            onUpdateObligation={(obligationId, updater) =>
              setData((prev) => ({
                ...prev,
                obligations: prev.obligations.map((item) =>
                  item.id === obligationId ? updater(item) : item,
                ),
              }))
            }
          />
        );

      case 'payroll':
        return (
          <PayrollWorkspace
            employees={
              defaultPayrollEntity
                ? employees.filter((item) => item.entityId === defaultPayrollEntity.id)
                : employees
            }
            directDepositAuthorizations={
              defaultPayrollEntity
                ? directDepositAuthorizations.filter((item) => item.entityId === defaultPayrollEntity.id)
                : directDepositAuthorizations
            }
            onAddEmployee={() => setIsEmployeeModalOpen(true)}
            onRequestDirectDeposit={() => setIsDirectDepositModalOpen(true)}
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
              onAddManualBankAccount={() => setIsManualBankAccountModalOpen(true)}
              onAddManualTransaction={() => setIsManualBankTransactionModalOpen(true)}
              onUpdateImportPolicy={handleUpdateBankImportPolicy}
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
              railControls={remittanceRailControls}
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
      <CouponPresentmentModal
        open={isCouponPresentmentModalOpen}
        obligations={defaultEntity ? obligations.filter((item) => item.entityId === defaultEntity.id) : obligations}
        instrumentSettlements={
          defaultEntity
            ? instrumentSettlements.filter((item) => item.entityId === defaultEntity.id)
            : instrumentSettlements
        }
        treasuryAccounts={
          defaultEntity
            ? treasuryAccounts.filter((item) => item.entityId === defaultEntity.id)
            : treasuryAccounts
        }
        bankAccounts={defaultEntity ? bankAccounts.filter((item) => item.entityId === defaultEntity.id) : bankAccounts}
        ledgerAccounts={
          defaultEntity
            ? ledgerAccounts.filter((item) => item.entityId === defaultEntity.id)
            : ledgerAccounts
        }
        onClose={() => setIsCouponPresentmentModalOpen(false)}
        onSubmit={handleCouponPresentmentSubmit}
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

      <BankAccountManualModal
        isOpen={isManualBankAccountModalOpen}
        ledgerAccounts={
          defaultEntity
            ? ledgerAccounts.filter((item) => item.entityId === defaultEntity.id)
            : ledgerAccounts
        }
        defaultCurrency={data.workspaceSettings.baseCurrency}
        onClose={() => setIsManualBankAccountModalOpen(false)}
        onSubmit={handleAddManualBankAccount}
      />

      <ManualBankTransactionModal
        isOpen={isManualBankTransactionModalOpen}
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
        onClose={() => setIsManualBankTransactionModalOpen(false)}
        onSubmit={handleAddManualBankTransaction}
      />
      <EmployeeModal
        open={isEmployeeModalOpen}
        onClose={() => setIsEmployeeModalOpen(false)}
        onSubmit={handleAddEmployee}
      />
      <DirectDepositRequestModal
        open={isDirectDepositModalOpen}
        employees={
          defaultPayrollEntity
            ? employees.filter((item) => item.entityId === defaultPayrollEntity.id)
            : employees
        }
        onClose={() => setIsDirectDepositModalOpen(false)}
        onSubmit={handleDirectDepositRequestSubmit}
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
              onAddEmployee={() => setIsEmployeeModalOpen(true)}
              onAddInvoice={() => setIsInvoiceModalOpen(true)}
              onRecordPayment={() => setIsPaymentModalOpen(true)}
              onRequestDirectDeposit={() => {
                setActiveSubsection('payroll');
                if (typeof window !== 'undefined') {
                  window.location.hash = '#accounting:payroll';
                }
                setIsDirectDepositModalOpen(true);
              }}
              onAddJournalEntry={() => setIsJournalModalOpen(true)}
              onAddBill={() => setIsBillModalOpen(true)}
              onAddReceipt={() => setIsReceiptModalOpen(true)}
              onAddPresentment={() => setIsCouponPresentmentModalOpen(true)}
              onGenerateQuote={() => setIsQuoteModalOpen(true)}
              onManageBankFeed={() => {
                setActiveSubsection('bankFeed');
                if (typeof window !== 'undefined') {
                  window.location.hash = '#accounting:bankFeed';
                }
              }}
              onAddIntercompanyTransfer={() => setIsIntercompanyModalOpen(true)}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {subnavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSubsection(item.id);
                    if (typeof window !== 'undefined') {
                      window.location.hash = `#accounting:${item.id}`;
                    }
                  }}
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
