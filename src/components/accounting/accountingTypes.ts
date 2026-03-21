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
  notes: string;
  linkedInvoiceId?: string;
  linkedBillId?: string;
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
