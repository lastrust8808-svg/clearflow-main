import type { CSSProperties } from 'react';

interface AccountingToolbarProps {
  onAddInvoice: () => void;
  onAddJournalEntry: () => void;
  onAddBill: () => void;
  onAddPresentment: () => void;
  onRecordPayment: () => void;
  onResumePresentmentDraft?: () => void;
  hasSavedPresentmentDraft?: boolean;
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
  onAddBill,
  onAddPresentment,
  onRecordPayment,
  onAddJournalEntry,
  onResumePresentmentDraft,
  hasSavedPresentmentDraft = false,
}: AccountingToolbarProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      <button type="button" onClick={onAddInvoice} style={buttonStyle}>+ Add Invoice</button>
      <button type="button" onClick={onAddBill} style={buttonStyle}>+ Add Bill</button>
      <button type="button" onClick={onAddPresentment} style={buttonStyle}>+ Add Remittance</button>
      <button type="button" onClick={onRecordPayment} style={buttonStyle}>+ Send Funds</button>
      <button type="button" onClick={onAddJournalEntry} style={buttonStyle}>+ Manual Journal</button>
      {hasSavedPresentmentDraft && onResumePresentmentDraft ? (
        <button type="button" onClick={onResumePresentmentDraft} style={buttonStyle}>
          Resume Draft Presentment
        </button>
      ) : null}
    </div>
  );
}
