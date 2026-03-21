export type AppSection =
  | 'overview'
  | 'entities'
  | 'accounting'
  | 'ledger'
  | 'assets'
  | 'transactions'
  | 'compliance'
  | 'documents'
  | 'aiStudio'
  | 'settings';

export type EntityType =
  | 'trust'
  | 'llc'
  | 'corporation'
  | 'partnership'
  | 'individual'
  | 'nonprofit'
  | 'other';

export type AssetCategory =
  | 'real_estate'
  | 'metal'
  | 'cash'
  | 'receivable'
  | 'security'
  | 'digital_asset'
  | 'tokenized_claim'
  | 'smart_contract_position'
  | 'ip'
  | 'domain'
  | 'equipment'
  | 'other';

export type AssetStatus =
  | 'active'
  | 'restricted'
  | 'pending_review'
  | 'liquidated'
  | 'disputed'
  | 'archived';

export type PaymentMediumClassification =
  | 'specie'
  | 'fiat'
  | 'private_tender'
  | 'digital_asset'
  | 'mixed_contractual_tender';

export type ObligationType =
  | 'public_obligation'
  | 'private_obligation'
  | 'secured_private_obligation'
  | 'pledged_performance_security'
  | 'reserve_backed_claim';

export type InstrumentType =
  | 'promissory_note'
  | 'private_bond'
  | 'pledged_metal_reserve'
  | 'contract_right'
  | 'performance_security_posting'
  | 'tender_designation'
  | 'tokenized_note'
  | 'tokenized_equity'
  | 'custody_record'
  | 'other';

export type AuthorityRecordType =
  | 'attorney_of_record'
  | 'private_representative'
  | 'power_of_attorney'
  | 'notice_of_appearance'
  | 'client_authorization'
  | 'trustee_authority'
  | 'manager_authority'
  | 'other';

export type CustodyType =
  | 'self_custody'
  | 'exchange'
  | 'qualified_custodian'
  | 'multisig'
  | 'contract';

export type DigitalAssetSubtype =
  | 'native_coin'
  | 'fungible_token'
  | 'stablecoin'
  | 'nft'
  | 'tokenized_note'
  | 'tokenized_equity'
  | 'staking_position'
  | 'lp_position'
  | 'domain_asset'
  | 'other';

export type DigitalAssetClassification =
  | 'payment'
  | 'utility'
  | 'security_like'
  | 'commodity_like'
  | 'collectible'
  | 'unclassified';

export type CustodyStatus =
  | 'controlled'
  | 'delegated'
  | 'locked'
  | 'disputed';

export type ComplianceStatus =
  | 'ok'
  | 'review'
  | 'restricted'
  | 'unknown';

export type OnChainEventType =
  | 'send'
  | 'receive'
  | 'swap'
  | 'mint'
  | 'burn'
  | 'stake'
  | 'unstake'
  | 'reward'
  | 'bridge'
  | 'contract_interaction';

export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'transfer'
  | 'journal'
  | 'income'
  | 'expense'
  | 'wallet_transfer'
  | 'token_issuance'
  | 'token_receipt'
  | 'smart_contract_deposit'
  | 'smart_contract_withdrawal'
  | 'swap'
  | 'staking_reward'
  | 'gas_fee'
  | 'mint'
  | 'burn'
  | 'bridge_transfer'
  | 'custody_transfer';

export type SettlementPath =
  | 'ach'
  | 'wire'
  | 'internal_ledger'
  | 'card'
  | 'cash'
  | 'wallet'
  | 'tokenized_credit'
  | 'tokenized_debit'
  | 'mixed';

export type SettlementStatus =
  | 'draft'
  | 'routing'
  | 'verifying'
  | 'clearing'
  | 'settled'
  | 'exception';

export type LiquidCashStage =
  | 'unfunded'
  | 'pending_liquidation'
  | 'liquid_cash_pending'
  | 'liquid_cash_available'
  | 'liquid_cash_reserved'
  | 'liquid_cash_released';

export type VerificationMethod =
  | 'bank_confirmation'
  | 'wallet_confirmation'
  | 'internal_control_token'
  | 'reserve_attestation'
  | 'manual_override';

export type VerificationStatus =
  | 'not_started'
  | 'pending'
  | 'verified'
  | 'exception';

export type AutoReconcileStatus = 'pending' | 'matched' | 'partial' | 'exception';

export type InterEntityLedgerSide = 'origin' | 'destination';

export type InterEntitySettlementMode = 'mirrored_halves' | 'cross_entity_clearing';

export type TokenStatus = 'draft' | 'issued' | 'verified' | 'revoked';

export type TokenSubjectType =
  | 'entity'
  | 'transaction'
  | 'document'
  | 'instrument'
  | 'authority_record'
  | 'settlement'
  | 'digital_asset'
  | 'smart_contract_position';

export type WorkspaceThemeMode =
  | 'ocean_luxe'
  | 'midnight_gold'
  | 'glitter_pop'
  | 'quiet_stewardship';

export type DocumentCategory =
  | 'governing'
  | 'financial'
  | 'compliance'
  | 'contract'
  | 'title'
  | 'tax'
  | 'wallet_control_memo'
  | 'token_issuance_memo'
  | 'smart_contract_summary'
  | 'reserve_attestation'
  | 'custody_resolution'
  | 'digital_asset_policy'
  | 'compliance_classification_memo'
  | 'tx_audit_packet'
  | 'legal_memo'
  | 'authority_record'
  | 'other';

export interface EntityRecord {
  id: string;
  name: string;
  type: EntityType;
  displayName?: string;
  jurisdiction?: string;
  country?: string;
  formationDate?: string;
  taxId?: string;
  status: 'active' | 'inactive' | 'draft';
  ownerDisplay?: string;
  representativeName?: string;
  representativeRole?: string;
  branding?: {
    accentColor?: string;
    documentLogoText?: string;
    emailFromName?: string;
    replyToEmail?: string;
    invoiceFooterNote?: string;
  };
  numbering?: {
    invoicePrefix: string;
    quotePrefix: string;
    billPrefix: string;
    receiptPrefix: string;
    journalPrefix: string;
    nextInvoiceSequence: number;
    nextQuoteSequence: number;
    nextBillSequence: number;
    nextReceiptSequence: number;
    nextJournalSequence: number;
  };
  operationalDefaults?: {
    baseCurrency: string;
    fiscalYearStartMonth: number;
    defaultSettlementPath: SettlementPath;
    interEntitySettlementMode: InterEntitySettlementMode;
    autoIssueVerificationTokens: boolean;
    autoReconcileLedgerLinks: boolean;
  };
}

export interface LedgerAccountRecord {
  id: string;
  entityId: string;
  code: string;
  name: string;
  accountType:
    | 'asset'
    | 'liability'
    | 'equity'
    | 'income'
    | 'expense'
    | 'memo';
  currency?: string;
  balance: number;
  linkedAssetIds?: string[];
  linkedWalletIds?: string[];
}

export interface AssetRecord {
  id: string;
  entityId: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  bookValue: number;
  marketValue?: number;
  paymentMedium?: PaymentMediumClassification;
  linkedLedgerAccountId?: string;
  linkedDocumentIds?: string[];
  complianceTagIds?: string[];
  notes?: string;
}

export interface WalletRecord {
  id: string;
  entityId: string;
  name: string;
  network: string;
  address: string;
  custodyType: CustodyType;
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface DigitalAssetRecord {
  id: string;
  entityId: string;
  walletId?: string;
  name: string;
  symbol?: string;
  network?: string;
  assetSubtype: DigitalAssetSubtype;
  quantity: number;
  estimatedValue: number;
  basis?: number;
  classification: DigitalAssetClassification;
  custodyStatus: CustodyStatus;
  complianceStatus: ComplianceStatus;
  contractAddress?: string;
  tokenId?: string;
  explorerUrl?: string;
  linkedLedgerAccountId?: string;
  linkedTokenIds?: string[];
  linkedDocumentIds?: string[];
  linkedComplianceTagIds?: string[];
}

export interface SmartContractPositionRecord {
  id: string;
  entityId: string;
  walletId?: string;
  name: string;
  network: string;
  protocolName?: string;
  contractAddress?: string;
  positionType:
    | 'staking'
    | 'lp'
    | 'vault'
    | 'escrow'
    | 'tokenized_instrument'
    | 'other';
  depositedAssetIds?: string[];
  estimatedValue?: number;
  status: 'active' | 'closed' | 'pending' | 'disputed';
  linkedTokenIds?: string[];
  linkedDocumentIds?: string[];
}

export interface InstrumentRecord {
  id: string;
  entityId: string;
  title: string;
  instrumentType: InstrumentType;
  issueDate?: string;
  maturityDate?: string;
  denominationValue?: number;
  paymentMedium?: PaymentMediumClassification;
  obligationType?: ObligationType;
  pledgedCollateralValue?: number;
  liquidationDiscount?: number;
  performanceSecurityStatus?: 'none' | 'posted' | 'called' | 'released';
  linkedTokenIds?: string[];
  linkedAssetIds?: string[];
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface ObligationRecord {
  id: string;
  entityId: string;
  title: string;
  obligationType: ObligationType;
  amount: number;
  paymentMedium: PaymentMediumClassification;
  status: 'open' | 'satisfied' | 'disputed' | 'defaulted';
  securedByAssetIds?: string[];
  linkedInstrumentIds?: string[];
  linkedDocumentIds?: string[];
  gainOrLossOnDischarge?: number;
}

export interface AuthorityRecord {
  id: string;
  entityId: string;
  personName: string;
  recordType: AuthorityRecordType;
  signerEmail?: string;
  signerPhone?: string;
  effectiveDate?: string;
  expirationDate?: string;
  clientAuthorizationStatus?: 'active' | 'limited' | 'revoked' | 'unknown';
  approvalStatus?: 'draft' | 'pending_acceptance' | 'accepted' | 'declined';
  acceptedAt?: string;
  acceptedBy?: string;
  linkedTokenIds?: string[];
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface OnChainTransactionRecord {
  id: string;
  entityId: string;
  walletId?: string;
  txHash: string;
  network: string;
  eventType: OnChainEventType;
  assetId?: string;
  timestamp: string;
  feeAmount?: number;
  feeAssetSymbol?: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface TransactionRecord {
  id: string;
  entityId: string;
  type: TransactionType;
  title: string;
  amount: number;
  currency: string;
  date: string;
  status: 'draft' | 'posted' | 'pending' | 'failed';
  linkedLedgerAccountIds?: string[];
  linkedAssetIds?: string[];
  linkedDocumentIds?: string[];
  linkedWalletId?: string;
  linkedOnChainRecordId?: string;
  linkedSettlementId?: string;
  linkedPaymentIds?: string[];
  linkedJournalEntryIds?: string[];
  linkedTokenIds?: string[];
  counterpartyEntityId?: string;
  sharedTransferGroupId?: string;
  ledgerSide?: InterEntityLedgerSide;
  txHash?: string;
  notes?: string;
}

export interface InterEntityTransferRecord {
  id: string;
  transferGroupId: string;
  fromEntityId: string;
  toEntityId: string;
  fromTransactionId: string;
  toTransactionId: string;
  amount: number;
  currency: string;
  effectiveDate: string;
  settlementMode: InterEntitySettlementMode;
  status: 'draft' | 'posted' | 'settled';
  memo?: string;
}

export interface SettlementRecord {
  id: string;
  entityId: string;
  linkedTransactionId: string;
  linkedPaymentId?: string;
  linkedJournalEntryIds?: string[];
  linkedReconciliationId?: string;
  linkedOnChainRecordId?: string;
  path: SettlementPath;
  direction: 'incoming' | 'outgoing';
  status: SettlementStatus;
  liquidCashStage: LiquidCashStage;
  verificationMethod: VerificationMethod;
  verificationStatus: VerificationStatus;
  verificationReference?: string;
  tokenizedProofId?: string;
  linkedTokenIds?: string[];
  grossAmount: number;
  settledAmount: number;
  currency: string;
  initiatedAt: string;
  expectedSettlementDate?: string;
  actualSettlementDate?: string;
  reserveBacked?: boolean;
  requiresManualReview?: boolean;
  autoReconcileStatus: AutoReconcileStatus;
  notes?: string;
}

export interface ComplianceTagRecord {
  id: string;
  entityId?: string;
  label: string;
  category:
    | 'entity'
    | 'asset'
    | 'digital_asset'
    | 'tax'
    | 'reporting'
    | 'jurisdiction'
    | 'risk'
    | 'authority';
  status: ComplianceStatus;
  dueDate?: string;
  jurisdiction?: string;
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface BankOnboardingChecklistItem {
  id: string;
  label: string;
  status: 'pending' | 'ready' | 'completed';
  linkedDocumentId?: string;
  notes?: string;
}

export interface DigitalAssetComplianceRecord {
  id: string;
  entityId: string;
  digitalAssetId: string;
  assetType: string;
  custodyModel: CustodyType;
  jurisdictionalRiskTag: string;
  taxTreatmentTag: string;
  securitiesCommodityPaymentFlag:
    | 'security'
    | 'commodity'
    | 'payment_token'
    | 'mixed'
    | 'unclassified';
  reportingRequirements: string[];
  counterpartyOrProtocolRisk: 'low' | 'medium' | 'high' | 'unknown';
  sourceOfFundsRecordStatus: 'complete' | 'partial' | 'missing' | 'unknown';
  notes?: string;
}

export interface DocumentRecord {
  id: string;
  entityId: string;
  title: string;
  category: DocumentCategory;
  date: string;
  status: 'draft' | 'final' | 'archived';
  templateKey?:
    | 'formation_packet'
    | 'signer_assignment'
    | 'banking_setup'
    | 'operating_agreement'
    | 'compliance_kickoff';
  outputStatus?: 'drafting' | 'review' | 'ready' | 'executed';
  generatedBody?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt?: string;
  sourceFileId?: string;
  sourceRecordType?: 'bill' | 'receipt' | 'document' | 'reconciliation';
  sourceRecordId?: string;
  linkedAssetIds?: string[];
  linkedWalletIds?: string[];
  linkedTransactionIds?: string[];
  linkedInstrumentIds?: string[];
  linkedAuthorityRecordIds?: string[];
  linkedComplianceTagIds?: string[];
  linkedTokenIds?: string[];
  vaultPath?: string;
  summary?: string;
}

export interface TokenRecord {
  id: string;
  entityId: string;
  subjectType: TokenSubjectType;
  subjectId: string;
  label: string;
  status: TokenStatus;
  tokenStandard?: string;
  network?: string;
  contractAddress?: string;
  tokenReference?: string;
  issuedAt: string;
  verifiedAt?: string;
  proofReference?: string;
  notes?: string;
}

export interface AIWorkflowRecord {
  id: string;
  name: string;
  category:
    | 'legal'
    | 'financial'
    | 'compliance'
    | 'digital_asset'
    | 'operations';
  description: string;
  outputTypes: string[];
}

export interface DashboardSummary {
  entityCount: number;
  accountCount: number;
  assetCount: number;
  digitalAssetCount: number;
  walletCount: number;
  transactionCount: number;
  onChainTransactionCount: number;
  documentCount: number;
  complianceCount: number;
  totalAssetBookValue: number;
  totalDigitalAssetEstimatedValue: number;
  reviewItems: number;
}

export interface WorkspaceSettingsRecord {
  workspaceName: string;
  themeMode: WorkspaceThemeMode;
  baseCurrency: string;
  defaultCountry?: string;
  defaultJurisdiction?: string;
  defaultSettlementPath: SettlementPath;
  defaultInterEntitySettlementMode: InterEntitySettlementMode;
  autoIssueVerificationTokens: boolean;
  autoReconcileJournalEntries: boolean;
  requireDocumentLinksForSettlements: boolean;
  digitalAssetVerificationRequired: boolean;
  supportEmail?: string;
  vaultRetentionPolicy: 'core_records_permanent' | 'seven_years' | 'custom';
  customRetentionNotes?: string;
  preferredAccentColor?: string;
}


export interface CustomerRecord {
  id: string;
  entityId: string;
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  status: 'active' | 'inactive';
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface VendorRecord {
  id: string;
  entityId: string;
  name: string;
  email?: string;
  phone?: string;
  remitAddress?: string;
  defaultExpenseAccountId?: string;
  status: 'active' | 'inactive';
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface InvoiceLineRecord {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  incomeAccountId?: string;
  taxCodeId?: string;
}

export interface InvoiceRecord {
  id: string;
  entityId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  status:
    | 'draft'
    | 'issued'
    | 'sent'
    | 'partially_paid'
    | 'paid'
    | 'disputed'
    | 'void';
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  balanceDue: number;
  deliveryMethod: 'internal_user' | 'email' | 'export' | 'manual';
  deliveryStatus?: 'draft' | 'ready_to_send' | 'sent';
  sentAt?: string;
  viewedAt?: string;
  exportedAt?: string;
  lastPreviewedAt?: string;
  deliveryNotes?: string;
  deliveryJobId?: string;
  exportJobId?: string;
  recipientEmail?: string;
  internalDeliveryTarget?: string;
  paymentRailPreference?: 'ach' | 'wire' | 'card' | 'digital_asset' | 'manual';
  paymentInstructions?: string;
  paymentLinkLabel?: string;
  acceptsDigitalAssets?: boolean;
  verificationRequired?: boolean;
  defaultSettlementPath?: SettlementPath;
  brandingSnapshot?: {
    accentColor?: string;
    logoText?: string;
    footerNote?: string;
    headerStyle?: string;
  };
  linkedLineItems: InvoiceLineRecord[];
  linkedDocumentIds?: string[];
  linkedPaymentIds?: string[];
  linkedTransactionIds?: string[];
  linkedTokenIds?: string[];
  notes?: string;
}

export interface BillLineRecord {
  id: string;
  description: string;
  amount: number;
  expenseAccountId?: string;
  assetAccountId?: string;
  taxCodeId?: string;
}

export interface BillRecord {
  id: string;
  entityId: string;
  vendorId: string;
  billNumber?: string;
  issueDate: string;
  dueDate?: string;
  status:
    | 'draft'
    | 'entered'
    | 'approved'
    | 'partially_paid'
    | 'paid'
    | 'disputed'
    | 'void';
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  balanceDue: number;
  linkedLineItems: BillLineRecord[];
  linkedReceiptIds?: string[];
  linkedDocumentIds?: string[];
  linkedPaymentIds?: string[];
  linkedTransactionIds?: string[];
  intakeStatus?: 'manual' | 'extracted' | 'needs_review' | 'failed';
  extractionSummary?: string;
  extractedVendorName?: string;
  extractedAmount?: number;
  extractedDueDate?: string;
  notes?: string;
}

export interface ReceiptRecord {
  id: string;
  entityId: string;
  vendorId?: string;
  receiptDate: string;
  totalAmount: number;
  currency: string;
  sourceType: 'upload' | 'photo' | 'email' | 'internal';
  fileName?: string;
  vaultPath?: string;
  status: 'unreviewed' | 'reviewed' | 'matched' | 'archived';
  linkedExpenseId?: string;
  linkedBillId?: string;
  linkedDocumentIds?: string[];
  intakeStatus?: 'manual' | 'extracted' | 'needs_review' | 'failed';
  extractionSummary?: string;
  extractedMerchantName?: string;
  extractedAmount?: number;
  extractedReceiptDate?: string;
  extractedCategoryHint?: string;
  notes?: string;
}

export interface ExpenseRecord {
  id: string;
  entityId: string;
  vendorId?: string;
  expenseDate: string;
  description: string;
  amount: number;
  currency: string;
  expenseAccountId?: string;
  paymentMethod?: 'cash' | 'bank' | 'card' | 'digital_asset' | 'other';
  reimbursementStatus?: 'none' | 'due' | 'submitted' | 'paid';
  receiptId?: string;
  linkedTransactionIds?: string[];
  status: 'draft' | 'submitted' | 'approved' | 'posted' | 'archived';
}

export interface PaymentRecord {
  id: string;
  entityId: string;
  direction: 'incoming' | 'outgoing';
  counterpartyType: 'customer' | 'vendor' | 'other';
  counterpartyId?: string;
  paymentDate: string;
  amount: number;
  currency: string;
  method:
    | 'ach'
    | 'wire'
    | 'check'
    | 'card'
    | 'cash'
    | 'internal_transfer'
    | 'digital_asset'
    | 'other';
  status: 'draft' | 'initiated' | 'settled' | 'failed' | 'reversed';
  linkedInvoiceIds?: string[];
  linkedBillIds?: string[];
  linkedTransactionIds?: string[];
  linkedSettlementId?: string;
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface BankAccountRecord {
  id: string;
  entityId: string;
  institutionName: string;
  accountName: string;
  last4?: string;
  accountType: 'checking' | 'savings' | 'credit_card' | 'custodial' | 'other';
  currency: string;
  status: 'active' | 'inactive';
  currentBalance?: number;
  linkedLedgerAccountId?: string;
  linkedDocumentIds?: string[];
  onboardingStatus?: 'draft' | 'collecting' | 'ready' | 'submitted' | 'connected';
  onboardingChecklist?: BankOnboardingChecklistItem[];
}

export interface ReconciliationStatementLineRecord {
  id: string;
  postedDate: string;
  description: string;
  amount: number;
  direction: 'credit' | 'debit';
  rawAmountText?: string;
  reference?: string;
  matchStatus: 'unreviewed' | 'suggested' | 'matched' | 'exception';
  suggestedPaymentId?: string;
  suggestedTransactionIds?: string[];
  linkedJournalEntryId?: string;
  confidenceScore?: number;
  resolvedAt?: string;
  notes?: string;
}

export interface ReconciliationRecord {
  id: string;
  entityId: string;
  bankAccountId: string;
  periodStart: string;
  periodEnd: string;
  statementEndingBalance: number;
  clearedTransactionIds: string[];
  unmatchedTransactionIds?: string[];
  status: 'open' | 'in_review' | 'completed';
  statementFileName?: string;
  statementImportedAt?: string;
  statementImportId?: string;
  preparedBy?: string;
  reviewedBy?: string;
  closedAt?: string;
  closeJobId?: string;
  closeSummary?: string;
  exceptionNotes?: string;
  linkedDocumentIds?: string[];
  parsedStatementLines?: ReconciliationStatementLineRecord[];
  matchedStatementLineIds?: string[];
  unmatchedStatementLineIds?: string[];
  statementReviewStatus?: 'not_imported' | 'needs_review' | 'ready_to_close' | 'completed';
  closeApprovalStatus?: 'pending' | 'approved' | 'closed';
  controllerSignoffName?: string;
  controllerSignoffAt?: string;
  closeOverrideReason?: string;
  notes?: string;
}

export interface AccountingPeriodRecord {
  id: string;
  entityId: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'soft_closed' | 'closed';
}

export interface JournalEntryRecord {
  id: string;
  entityId: string;
  entryNumber: string;
  entryDate: string;
  memo: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  status: 'draft' | 'posted';
  source: 'manual' | 'system';
  linkedTransactionIds?: string[];
  linkedSettlementIds?: string[];
  autoReconcileStatus?: AutoReconcileStatus;
  linkedDocumentIds?: string[];
  verificationRequired?: boolean;
}

export interface CoreDataBundle {
  entities: EntityRecord[];
  customers: CustomerRecord[];
  vendors: VendorRecord[];
  invoices: InvoiceRecord[];
  bills: BillRecord[];
  receipts: ReceiptRecord[];
  expenses: ExpenseRecord[];
  payments: PaymentRecord[];
  bankAccounts: BankAccountRecord[];
  reconciliations: ReconciliationRecord[];
  accountingPeriods: AccountingPeriodRecord[];
  journalEntries: JournalEntryRecord[];
  settlements: SettlementRecord[];
  ledgerAccounts: LedgerAccountRecord[];
  assets: AssetRecord[];
  wallets: WalletRecord[];
  digitalAssets: DigitalAssetRecord[];
  smartContractPositions: SmartContractPositionRecord[];
  instruments: InstrumentRecord[];
  obligations: ObligationRecord[];
  authorityRecords: AuthorityRecord[];
  onChainTransactions: OnChainTransactionRecord[];
  transactions: TransactionRecord[];
  interEntityTransfers: InterEntityTransferRecord[];
  complianceTags: ComplianceTagRecord[];
  digitalAssetCompliance: DigitalAssetComplianceRecord[];
  documents: DocumentRecord[];
  tokens: TokenRecord[];
  aiWorkflows: AIWorkflowRecord[];
  workspaceSettings: WorkspaceSettingsRecord;
}






