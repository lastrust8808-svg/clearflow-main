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
  const actions = [
    { label: '+ Add Invoice', helper: 'Create a receivable invoice and return to the dashboard overview.', onClick: onAddInvoice },
    { label: '+ Add Bill', helper: 'Capture a payable bill and return to the dashboard overview.', onClick: onAddBill },
    { label: '+ Add Remittance', helper: 'Start a remittance or coupon presentment workflow.', onClick: onAddPresentment },
    { label: '+ Send Funds', helper: 'Create a payment, release, or settlement instruction.', onClick: onRecordPayment },
    { label: '+ Manual Journal', helper: 'Post a journal entry directly into the books.', onClick: onAddJournalEntry },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 14,
        border: '1px solid rgba(148,163,184,0.14)',
        background: 'rgba(15,23,42,0.18)',
      }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          style={buttonStyle}
          title={action.helper}
        >
          {action.label}
        </button>
      ))}
      {hasSavedPresentmentDraft && onResumePresentmentDraft ? (
        <button
          type="button"
          onClick={onResumePresentmentDraft}
          style={buttonStyle}
          title="Reopen the saved presentment draft and continue where you left off."
        >
          Resume Draft Presentment
        </button>
      ) : null}
    </div>
  );
}
