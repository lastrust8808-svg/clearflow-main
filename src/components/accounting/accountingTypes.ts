import type { JournalEntryRecord } from '../../types/core';

export type AccountingSection =
  | 'dashboard'
  | 'invoices'
  | 'quotes'
  | 'bills'
  | 'expenses'
  | 'receipts'
  | 'customers'
  | 'vendors'
  | 'payments'
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
  dischargeMethod?:
    | 'internal_ledger_credit'
    | 'instrument_performance'
    | 'bank_rail_payment'
    | 'mixed_discharge';
  urgency?: 'instant' | 'same_day' | 'standard' | 'final';
  notes: string;
  linkedInvoiceId?: string;
  linkedBillId?: string;
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
