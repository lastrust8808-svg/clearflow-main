import type { JournalEntryRecord } from '../../types/core';

export type AccountingSection =
  | 'dashboard'
  | 'invoices'
  | 'quotes'
  | 'bills'
  | 'expenses'
  | 'receipts'
  | 'presentments'
  | 'railOps'
  | 'customers'
  | 'vendors'
  | 'payments'
  | 'recurring'
  | 'payroll'
  | 'bankFeed'
  | 'intercompany'
  | 'reconciliation';

export type JournalDraft = JournalEntryRecord;

export interface AccountingStats {
  openInvoiceCount: number;
  openInvoiceAmount: number;
  openBillCount: number;
  openBillAmount: number;
  totalMonthlyIn: number;
  totalMonthlyOut: number;
  upcomingPayments: number;
  receiptCount: number;
  journalCount: number;
}

export interface InvoiceSubmitPayload {
  mode: 'quick' | 'custom' | 'template';
  preset: string;
  entityProfileKey: string;
  customerName: string;
  deliveryMethod: 'internal_user' | 'email' | 'export' | 'manual';
  recipientEmail: string;
  internalDeliveryTarget: string;
  invoiceNumberMode: 'auto' | 'manual';
  manualInvoiceNumber: string;
  startingNumber: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  lineDescription: string;
  amount: string;
  taxMode: 'none' | 'state';
  jurisdiction: string;
  notes: string;
  themeColor: string;
  logoName: string;
  headerStyle: string;
  footerNote: string;
  templateName: string;
  paymentRailPreference: 'ach' | 'wire' | 'card' | 'digital_asset' | 'manual';
  paymentInstructions: string;
  paymentLinkLabel: string;
  acceptsDigitalAssets: boolean;
}

export interface CounterpartySubmitPayload {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  sourceProfileId?: string;
  sourceProfileLabel?: string;
  sourceProfileType?: 'directory_profile' | 'preset_profile' | 'manual_match';
  sourceCanonicalName?: string;
  sourceLocationId?: string;
  sourceTaxId?: string;
  sourcePublicProfileUrl?: string;
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
  organizationClass?:
    | 'general'
    | 'large_bank'
    | 'large_corporation'
    | 'utility'
    | 'government'
    | 'servicer';
  termsIntakeMode?: 'none' | 'auto_load' | 'upload_contract' | 'manual_reference';
  billingErrorSupport?: boolean;
  disputeResolutionPath?:
    | 'none'
    | 'notice_and_cure'
    | 'notice_mediation_arbitration'
    | 'notice_arbitration'
    | 'court_litigation';
  arbitrationForum?: 'aaa' | 'jams' | 'private_forum' | 'court_only' | 'unspecified';
  mediationStepPresent?: boolean;
  cureOfferRequired?: boolean;
  disputeNoticeDays?: string;
  disputeVenue?: string;
  arbitrationProcedureNotes?: string;
  lineOfCreditEnabled?: boolean;
  creditLineType?: 'revolving_trade' | 'term_vendor' | 'utility_credit' | 'service_contract';
  creditLimit?: string;
  startingAccountAmount?: string;
  autoAnnualizeFromBills?: boolean;
  contractFile?: File | null;
  contractFileName?: string;
}

export interface BillSubmitPayload {
  mode: 'camera' | 'upload' | 'manual';
  vendorName: string;
  billNumber: string;
  dueDate: string;
  amount: string;
  description: string;
  uploadedFileName: string;
  uploadedFile?: File | null;
  parsedNotes: string;
}

export interface ReceiptSubmitPayload {
  mode: 'camera' | 'upload' | 'manual';
  merchantName: string;
  receiptDate: string;
  amount: string;
  category: string;
  description: string;
  uploadedFileName: string;
  uploadedFile?: File | null;
  parsedNotes: string;
}

export interface CouponPresentmentSubmitPayload {
  mode: 'camera' | 'upload' | 'manual';
  title: string;
  receiverName: string;
  receiverAccountLabel: string;
  couponReference: string;
  presentmentDate: string;
  dueDate: string;
  amount: string;
  obligationId?: string;
  instrumentSettlementId?: string;
  treasuryAccountId?: string;
  sourceBankAccountId?: string;
  sourceLedgerAccountId?: string;
  dischargeMethod:
    | 'internal_ledger_credit'
    | 'instrument_performance'
    | 'bank_rail_payment'
    | 'mixed_discharge';
  uploadedFileName: string;
  uploadedFile?: File | null;
  parsedNotes: string;
}

export interface JournalSubmitPayload {
  entryNumber: string;
  entryDate: string;
  memo: string;
  debitAccount: string;
  creditAccount: string;
  amount: string;
}

export interface PaymentSubmitPayload {
  direction: 'incoming' | 'outgoing';
  counterpartyType: 'customer' | 'vendor' | 'other';
  counterpartyId?: string;
  paymentDate: string;
  amount: string;
  method: 'ach' | 'wire' | 'check' | 'card' | 'cash' | 'digital_asset' | 'other';
  sourceBankAccountId?: string;
  sourceLedgerAccountId?: string;
  treasuryAccountId?: string;
  linkedWalletId?: string;
  linkedDigitalAssetId?: string;
  vendorReceiveMethod?:
    | 'ach'
    | 'wire'
    | 'paper_check'
    | 'lockbox_coupon'
    | 'digital_wallet'
    | 'manual_review';
  dischargeMethod?:
    | 'internal_ledger_credit'
    | 'instrument_performance'
    | 'bank_rail_payment'
    | 'mixed_discharge';
  urgency?: 'instant' | 'same_day' | 'standard' | 'final';
  recurringEnabled?: boolean;
  recurringFrequency?:
    | 'weekly'
    | 'biweekly'
    | 'semimonthly'
    | 'monthly'
    | 'quarterly'
    | 'annually';
  recurringInterval?: string;
  recurringNextRunDate?: string;
  recurringAutoPost?: boolean;
  notes: string;
  linkedInvoiceId?: string;
  linkedBillId?: string;
}

export interface EmployeeSubmitPayload {
  fullName: string;
  email: string;
  phone?: string;
  title?: string;
  department?: string;
  employeeType: 'employee' | 'contractor' | 'officer';
  compensationType: 'salary' | 'hourly' | 'contract';
  paySchedule: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  annualSalary?: string;
  hourlyRate?: string;
  defaultHoursPerPeriod?: string;
  startDate?: string;
  notes?: string;
}

export interface DirectDepositRequestSubmitPayload {
  employeeId: string;
  requestEmail: string;
  sendByEmail: boolean;
  notes?: string;
  uploadedFile?: File | null;
  uploadedFileName?: string;
  signatureName?: string;
  routingNumber?: string;
  accountNumber?: string;
  accountType?: 'checking' | 'savings' | 'other';
}

export interface BankFeedRuleSubmitPayload {
  bankAccountId: string;
  name: string;
  merchantContains: string;
  direction: 'credit' | 'debit' | 'any';
  transactionType: 'income' | 'expense' | 'deposit' | 'withdrawal';
  defaultLedgerAccountId?: string;
  counterpartyLabel?: string;
  memoTemplate?: string;
  minAmount?: string;
  maxAmount?: string;
  verificationMode: 'bank_confirmation' | 'internal_control_token' | 'manual_review';
  autoPost: boolean;
  autoReconcile: boolean;
}

export interface ManualBankAccountSubmitPayload {
  institutionName: string;
  accountName: string;
  accountType: 'checking' | 'savings' | 'credit_card' | 'custodial' | 'other';
  currency: string;
  routingNumber?: string;
  accountNumber?: string;
  openingBalance?: string;
  linkedLedgerAccountId?: string;
  achOriginationEnabled: boolean;
  wireEnabled: boolean;
}

export interface ManualBankTransactionSubmitPayload {
  bankAccountId: string;
  postedDate: string;
  description: string;
  amount: string;
  direction: 'credit' | 'debit';
  transactionType: 'income' | 'expense' | 'deposit' | 'withdrawal';
  ledgerAccountId?: string;
  counterpartyLabel?: string;
  memo?: string;
  verificationMode: 'bank_confirmation' | 'internal_control_token' | 'manual_review';
  autoReconcile: boolean;
}

export interface InterEntityTransferSubmitPayload {
  fromEntityId: string;
  toEntityId: string;
  amount: string;
  effectiveDate: string;
  memo: string;
  settlementMode: 'mirrored_halves' | 'cross_entity_clearing';
  fromCashAccount: string;
  toCashAccount: string;
}

export interface QuoteSubmitPayload {
  mode: 'quick' | 'custom' | 'template';
  preset: string;
  entityProfileKey: string;
  customerName: string;
  quoteNumberMode: 'auto' | 'manual';
  manualQuoteNumber: string;
  startingNumber: string;
  issueDate: string;
  expiryDate: string;
  projectTitle: string;
  lineDescription: string;
  amount: string;
  taxMode: 'none' | 'state';
  jurisdiction: string;
  notes: string;
  themeColor: string;
  logoName: string;
  headerStyle: string;
  footerNote: string;
  templateName: string;
}
