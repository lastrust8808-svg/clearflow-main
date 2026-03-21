import type { CSSProperties } from 'react';

interface AccountingToolbarProps {
  onAddInvoice: () => void;
  onAddJournalEntry: () => void;
  onAddBill: () => void;
  onAddReceipt: () => void;
  onGenerateQuote: () => void;
  onAddIntercompanyTransfer: () => void;
  onAddCustomer: () => void;
  onAddVendor: () => void;
  onRecordPayment: () => void;
}

const buttonStyle: CSSProperties = {
  padding: '10px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.65)',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontWeight: 600,
};

export default function AccountingToolbar({
  onAddInvoice,
  onAddJournalEntry,
  onAddBill,
  onAddReceipt,
  onGenerateQuote,
  onAddIntercompanyTransfer,
  onAddCustomer,
  onAddVendor,
  onRecordPayment,
}: AccountingToolbarProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      <button type="button" onClick={onAddCustomer} style={buttonStyle}>+ Add Customer</button>
      <button type="button" onClick={onAddVendor} style={buttonStyle}>+ Add Vendor</button>
      <button type="button" onClick={onAddInvoice} style={buttonStyle}>+ Add Invoice</button>
      <button type="button" onClick={onRecordPayment} style={buttonStyle}>+ Record Payment</button>
      <button type="button" onClick={onAddJournalEntry} style={buttonStyle}>+ Add Journal Entry</button>
      <button type="button" onClick={onAddBill} style={buttonStyle}>+ Add Bill</button>
      <button type="button" onClick={onAddReceipt} style={buttonStyle}>+ Add Receipt</button>
      <button type="button" onClick={onGenerateQuote} style={buttonStyle}>+ Generate Quote</button>
      <button type="button" onClick={onAddIntercompanyTransfer} style={buttonStyle}>+ Intercompany Transfer</button>
    </div>
  );
}
