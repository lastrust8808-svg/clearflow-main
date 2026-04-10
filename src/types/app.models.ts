import type { CoreDataBundle } from './core';

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  userHandle?: string;
  referralCode?: string;
  referredByCode?: string;
  primaryContactType?: 'google' | 'email' | 'phone';
  isVerified: boolean;
  clearflowTermsAcceptedAt?: string;
  clearflowTermsVersion?: string;
  clearflowTermsSignerName?: string;
  clearflowTermsDocumentId?: string;
  clearflowRetainedRecordDocumentId?: string;
  clearflowInternalLedgerDepositId?: string;
  clearflowInternalLedgerDepositedAt?: string;
  clearflowInternalLedgerStatus?: 'pending' | 'recorded' | 'error';
  wealthMandate?: WealthMandateProfile;
  membershipProfile?: MembershipProfile;
}

export interface WealthMandateProfile {
  enabled: boolean;
  objective:
    | 'preservation'
    | 'balanced_growth'
    | 'income'
    | 'opportunistic'
    | 'fiduciary_stability';
  liquidityPreference: 'high' | 'balanced' | 'long_horizon';
  riskTolerance: 'low' | 'moderate' | 'elevated';
  timeHorizon: 'short' | 'medium' | 'long';
  notes?: string;
  activatedAt?: string;
}

export type MembershipTierPlan = 'steward' | 'operator' | 'crown';
export type MembershipBillingCadence = 'monthly';
export type MembershipAutopayMethod = 'bank' | 'card' | 'none';
export type MembershipStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'canceled';

export interface MembershipProfile {
  tier: MembershipTierPlan;
  status: MembershipStatus;
  billingCadence: MembershipBillingCadence;
  monthlyRate: number;
  autopayEnabled: boolean;
  autopayMethod: MembershipAutopayMethod;
  autopayDiscountRate: number;
  effectiveMonthlyRate: number;
  trialStartedAt: string;
  trialEndsAt: string;
  nextBillingDate: string;
  devProfileLinked?: boolean;
  referralCreditsUnlockedAt?: string;
}

export type RewardTier = 'steward' | 'operator' | 'treasury' | 'capital' | 'crown';

export interface RewardAccount {
  id: string;
  userId: string;
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  tier: RewardTier;
  linkedWalletId?: string;
  status: 'active' | 'restricted' | 'paused';
}

export interface RewardEntry {
  id: string;
  userId: string;
  entityId?: string;
  type: 'earn' | 'spend' | 'gift' | 'expire' | 'adjustment' | 'refund';
  sourceEvent:
    | 'membership_paid'
    | 'referral_signup'
    | 'referral_membership_paid'
    | 'invoice_sent'
    | 'invoice_paid'
    | 'bill_paid'
    | 'remittance_completed'
    | 'entity_onboarded'
    | 'bank_connected'
    | 'wallet_connected'
    | 'authority_completed'
    | 'document_retained'
    | 'manual';
  amount: number;
  description: string;
  occurredAt: string;
  status: 'posted' | 'pending' | 'reversed';
}

export interface RewardBadge {
  id: string;
  userId: string;
  badgeType:
      | 'first_entity_established'
      | 'network_builder'
      | 'invoices_in_motion'
    | 'paid_on_time'
    | 'trust_steward'
    | 'bond_operator'
    | 'reserve_builder'
    | 'settlement_clarity'
    | 'vault_keeper';
  title: string;
  description: string;
  earnedAt: string;
  mintable?: boolean;
  minted?: boolean;
  linkedWalletId?: string;
  chainNetwork?: string;
  tokenId?: string;
  txHash?: string;
  metadataUri?: string;
}

export interface RewardRedemption {
  id: string;
  userId: string;
  itemKey:
    | 'ai_extraction_pack'
    | 'premium_report'
    | 'trust_funding_packet'
    | 'bond_lifecycle_report'
    | 'storage_boost'
    | 'membership_discount';
  creditCost: number;
  status: 'pending' | 'fulfilled' | 'reversed';
  redeemedAt: string;
}

export type EntityType = 'LLC' | 'C-Corp' | 'S-Corp' | 'Trust/Estate' | 'Non-profit' | 'Personal';

export type WizardType = 'DTCC' | 'EXCHANGE' | 'REAL_ESTATE' | 'COLLATERAL' | 'FORENSIC' | 'SETTLEMENT' | 'LEGAL' | 'RESITUS' | 'RESOLUTION' | 'CREDIT_DEFENSE' | 'CHANCERY' | '1099' | 'ACCOUNT_RECON' | 'EDGAR' | 'MARAD';

export interface JournalEntryLine {
  account: string; // e.g., "Cash", "Rent Expense"
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  lines: JournalEntryLine[];
}

export interface Account {
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  balance: number;
}

export type ReserveCategory = 'General' | 'Tax' | 'Capital Expenditure' | 'Lending Pool';

export interface ReserveAccount {
  id: string;
  name: string;
  purpose: string;
  category: ReserveCategory;
  targetAmount: number;
  currentBalance: number;
}

export interface Invoice {
  id: string;
  customerName: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  status: 'draft' | 'sent' | 'paid' | 'overdue';
}

export interface Bill {
  id: string;
  vendorName: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  status: 'unpaid' | 'paid';
}

export interface Loan {
  id: string;
  borrower: string;
  principal: number;
  interestRate: number; // Annual percentage
  issueDate: string; // YYYY-MM-DD
  status: 'active' | 'paid';
  sourceReserveId: string;
}

export type PaymentRail = 'ACH' | 'Wire' | 'RTP' | 'Card' | 'Internal' | 'Check';
export type PaymentStatus = 'pending' | 'settled' | 'returned' | 'failed' | 'review';

export interface Payment {
  id: string;
  date: string; // YYYY-MM-DD
  settlementDate?: string; // YYYY-MM-DD
  partyName: string; // Recipient for outgoing, Sender for incoming
  amount: number;
  status: PaymentStatus;
  rail: PaymentRail;
  type: 'external' | 'internal';
  direction: 'outgoing' | 'incoming';
  signalDecision: 'ACCEPT' | 'REROUTE' | 'REVIEW' | 'N/A';
  memo?: string;
}

export type PlaidVerificationStatus = 
  | 'pending_automatic_verification'
  | 'pending_manual_verification'
  | 'manually_verified'
  | 'automatically_verified'
  | 'verification_expired'
  | 'verification_failed';

export type IdentityVerificationStatus = 'unverified' | 'pending_document' | 'verified' | 'failed';

export interface PlaidAchInfo {
  account: string;
  routing: string;
  isTokenized: boolean;
}

export interface PlaidAccountNumbers {
  ach?: PlaidAchInfo[];
}

export type PlaidSignalDecision = 'ACCEPT' | 'REROUTE' | 'REVIEW';

// Raw response from Plaid Signal - can be expanded if needed
type PlaidSignalRawResponse = any;

export interface PlaidSignalResponse {
  decision: PlaidSignalDecision;
  ruleset_key: string;
  signal: PlaidSignalRawResponse;
}

export interface PlaidAuthResponse {
  numbers: PlaidAccountNumbers;
  accounts: Array<{
    account_id: string;
    verification_status: PlaidVerificationStatus;
  }>
}

export interface PlaidIdentityData {
  accounts: Array<{
    owners: Array<{ names: string[] }>
  }>;
}

export interface PlaidIdentityMatchScores {
  legal_name: { score: number | null };
}

export interface PlaidConnectionPayload {
  authResponse: PlaidAuthResponse;
  identityData: PlaidIdentityData;
  identityMatchScores: PlaidIdentityMatchScores;
  itemId: string;
  institutionName?: string;
  linkedAccounts?: Array<{
    accountId: string;
    name: string;
    mask?: string;
    type?: string;
    subtype?: string;
  }>;
}

export interface PlaidTransaction {
    transaction_id: string;
    account_id: string;
    amount: number;
    date: string;
    name: string;
    pending: boolean;
    payment_channel: string;
    category?: string[];
}

export interface SystemStatus {
  serviceName: string;
  status: 'online' | 'offline' | 'degraded';
  details: string;
}

export type AssetCategory = 'Real Estate' | 'Financial' | 'Business' | 'Personal' | 'Digital' | 'Other';

export interface PlannedAsset {
  id: string;
  name: string;
  category: AssetCategory;
  type: string; // e.g., 'Residential Property', 'Stocks', 'Family Heirlooms', 'NFT', 'Default Judgement'
  estimatedValue: number;
  description: string;
  linkedReserveId?: string;
}

export interface WizardSession {
  id: string;
  entityId: string;
  type: WizardType;
  status: 'active' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  data: any;
}

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  ein: string;
  bankConnected: boolean;
  isVerified: boolean; // Business verification
  bankVerificationStatus?: PlaidVerificationStatus;
  identityVerificationStatus?: IdentityVerificationStatus;
  bankSourcedOwnerNames?: string[];
  reserveStatus?: 'locked' | 'pending' | 'active';
  stateRegistrationNumber?: string;
  labels?: Record<string, string>; // For cost allocation
  journal?: JournalEntry[];
  chartOfAccounts?: Account[];
  reserves?: ReserveAccount[];
  invoices?: Invoice[];
  bills?: Bill[];
  loans?: Loan[];
  payments?: Payment[];
  plannedAssets?: PlannedAsset[];
  wizardSessions?: WizardSession[];
  accountNumbers?: PlaidAccountNumbers;
  itemId?: string;
  transactions?: PlaidTransaction[];
}

export interface FinancialHighlight {
  label: string;
  value: string;
}

export interface KeyDate {
  label: string;
  date: string;
}

export interface AnalysisResult {
  documentType: string;
  entityName: string;
  ein: string;
  summary: string;
  remitAddress?: string;
  contactPhone?: string;
  accountReference?: string;
  processingReference?: string;
  paymentInstructionSummary?: string;
  keyDates: KeyDate[];
  financialHighlights: FinancialHighlight[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface IdAnalysisResult {
  fullName: string;
}

// === GCP-Style Billing Models ===

export interface RatedCharge {
  id: string; // The accounting event
  entityId: string; // Links to the Entity (Workspace/Cost Center) that incurred the cost
  invoiceId?: string; // Becomes non-null when invoiced
  timestamp: string; // The time of the usage event
  description: string; // e.g., "Gemini API: Document Analysis for 'CP575.pdf'"
  serviceId: string; // e.g., 'gemini-api'
  skuId: string; // e.g., 'document-analysis'
  usage: {
    quantity: number;
    unit: string; // e.g., 'call'
  };
  listPrice: number; // The "rate card" price per unit
  negotiatedPrice: number; // The actual price charged per unit
  cost: number; // usage.quantity * negotiatedPrice
  creditAmount: number; // Any applied credits or discounts
  finalCost: number; // cost - creditAmount
  isBilled: boolean;
}

export type BillingInvoiceStatus = 'draft' | 'open' | 'issued' | 'paid' | 'settled' | 'closed' | 'void';

// An Invoice is for a User (the Payer) and covers one or more Entities (Workspaces)
export interface BillingInvoice {
  id: string;
  userId: string; // The Payer
  periodStartDate: string; // YYYY-MM-DD
  periodEndDate: string; // YYYY-MM-DD
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  status: BillingInvoiceStatus;
  subtotal: number;
  credits: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
}

export interface Settlement {
  id: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
  method: 'ACH' | 'Wire' | 'Credit Card' | 'Internal';
  confirmationCode?: string;
}


export interface AppData {
  user: User;
  entities: Entity[];
  membershipProfile?: MembershipProfile;
  // New billing models
  ratedCharges?: RatedCharge[];
  billingInvoices?: BillingInvoice[];
  settlements?: Settlement[];
  rewardAccount?: RewardAccount;
  rewardEntries?: RewardEntry[];
  rewardBadges?: RewardBadge[];
  rewardRedemptions?: RewardRedemption[];
  coreDataSnapshot?: CoreDataBundle;
}

// === Regulation Z Scope Engine Models ===

export type RegZComplianceModule =
  | 'Disclosures-General'
  | 'Billing-Error-Resolution'
  | 'Unauthorized-Use-Liability'
  | 'Issuance-Rules';

export interface CreditTransactionInput {
  transactionDate: string; // YYYY-MM-DD
  borrowerType: 'individual' | 'organization' | 'trust';
  statedPurpose: 'consumer' | 'business' | 'agricultural' | 'commercial' | 'organizational' | 'uncertain';
  creditProductType: 'open-end' | 'closed-end' | 'credit-card';
  amount: number;
  isSecuredByRealProperty: boolean;

  initialExtensionAmount?: number;
  firmCommitmentAmount?: number;
  
  cardProgramDetails?: {
    programPurpose: 'consumer' | 'business';
  };
  
  trustDetails?: {
    trustType: 'estate-planning' | 'tax-planning' | 'land-trust' | 'other';
    trustPurpose: 'personal' | 'family' | 'household' | 'business';
  };
  
  rentalPropertyDetails?: {
    isOwnerOccupied: boolean;
    ownerOccupancyDaysNext12Months?: number;
    numberOfUnits: number;
    isForAcquisition: boolean;
  };
}

export interface RegZScopeDecision {
  isCoveredByRegZ: boolean;
  reasonCode: string;
  reasonDescription: string;
  requiredComplianceModules: RegZComplianceModule[];
  notes: string[];
}

// --- DIGITAL ASSET REGISTRY (CLARITY-STYLE, NON-BREAKING) ---

export type DigitalAssetClass =
  | 'Real Estate'
  | 'Precious Metal'
  | 'Coin'
  | 'Jewelry'
  | 'Equipment'
  | 'Receivable'
  | 'Promissory Note'
  | 'Security Instrument'
  | 'Trust Certificate'
  | 'Legal Instrument'
  | 'Intellectual Property'
  | 'Cash Equivalent'
  | 'Other';

export type DigitalAssetLegalCharacter =
  | 'Tangible Asset'
  | 'Intangible Asset'
  | 'Contract Right'
  | 'Payment Right'
  | 'Security Interest'
  | 'Beneficial Interest'
  | 'Utility Right'
  | 'Custodial Record'
  | 'Other';

export type DigitalAssetStatus = 'Registered' | 'Pledged' | 'Released' | 'Liquidated' | 'Transferred';

export type DigitalAssetCustodyStatus = 'Self Custody' | 'Third Party Custody' | 'Escrowed' | 'Locked';

export type DigitalAssetControlStatus = 'Owner Controlled' | 'Trustee Controlled' | 'Multi-Sig Controlled' | 'Smart Contract Controlled';

export type DigitalAssetValuationBasis = 'User Entered' | 'Appraisal' | 'Market Price' | 'Algorithmic';

export interface DigitalAssetRecord {
  id: string;
  entityId: string;
  assetNumber: string; // e.g. DAR-0001
  title: string;
  description?: string;
  assetClass: DigitalAssetClass;
  legalCharacter: DigitalAssetLegalCharacter;
  status: DigitalAssetStatus;
  jurisdiction?: string;
  custodyStatus: DigitalAssetCustodyStatus;
  controlStatus: DigitalAssetControlStatus;
  valuationBasis: DigitalAssetValuationBasis;
  bookValue?: number;
  fairValue?: number;
  reserveValue?: number;
  linkedLegacyRecordType?: string;
  linkedLegacyRecordId?: string;
  sourceDocumentIds: string[];
  documentHashChain: string[];
  complianceFlags: string[];
  tags: string[];
  effectiveDate: string;
  lastReviewedAt: string;
  _version: string;
}

export interface RealEstateAsset {
  id: string;
  entityId: string;
  propertyAddress: string;
  status: string;
}

export interface CreditInstrument {
  id: string;
  entityId: string;
  type: string;
  faceAmount: number;
  status: string;
}

export interface TrustCertificate {
  id: string;
  entityId: string;
  certificateNumber: string;
  status: string;
}

export interface LegalInstrument {
  id: string;
  entityId: string;
  title?: string;
  instrumentType?: string;
}

export interface ParcelRecord {
  id: string;
  entityId: string;
  parcelId?: string;
}

export interface CollateralItem {
  id: string;
  assetReferenceId?: string;
  description: string;
  status: string;
}

export type AssetTokenClass =
  | 'None'
  | 'RegistryToken'
  | 'ControlToken'
  | 'UtilityToken'
  | 'ClaimToken'
  | 'FractionalToken';

export interface AssetTokenProfile {
  id: string;
  assetId: string;
  entityId: string;
  tokenClass: AssetTokenClass;
  representationType: 'On-Chain' | 'Off-Chain Registry' | 'Hybrid';
  transferRestricted: boolean;
  requiresTrusteeApproval: boolean;
  confersProfitShare: boolean;
  confersCreditorRights: boolean;
  confersReturnOfPrincipal: boolean;
  isUtilityOnly: boolean;
  isFractionalized: boolean;
  notes?: string;
  _version: string;
}
