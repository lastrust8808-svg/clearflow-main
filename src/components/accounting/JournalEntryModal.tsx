import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

interface JournalEntryModalProps {
  open: boolean;
  onClose: () => void;
  defaultEntryNumber?: string;
  autoReconcileEnabled?: boolean;
  onSubmit: (payload: {
    entryNumber: string;
    entryDate: string;
    memo: string;
    debitAccount: string;
    creditAccount: string;
    amount: string;
  }) => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2,6,23,0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};

const modalStyle: CSSProperties = {
  width: 'min(760px, 100%)',
  maxHeight: '92vh',
  overflowY: 'auto',
  borderRadius: 16,
  border: '1px solid rgba(148,163,184,0.2)',
  background: '#0f172a',
  color: '#e5e7eb',
  padding: 20,
  display: 'grid',
  gap: 16,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.5)',
  color: '#e5e7eb',
  boxSizing: 'border-box',
};

const buttonStyle: CSSProperties = {
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.4)',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontWeight: 600,
};

export default function JournalEntryModal({
  open,
  onClose,
  defaultEntryNumber,
  autoReconcileEnabled,
  onSubmit,
}: JournalEntryModalProps) {
  const [entryNumber, setEntryNumber] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [memo, setMemo] = useState('');
  const [debitAccount, setDebitAccount] = useState('');
  const [creditAccount, setCreditAccount] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!open) return;
    setEntryNumber(defaultEntryNumber || '');
    setEntryDate('');
    setMemo('');
    setDebitAccount('');
    setCreditAccount('');
    setAmount('');
  }, [defaultEntryNumber, open]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Add Journal Entry</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Manual journal posting into the ERP accounting layer.
          </div>
          {autoReconcileEnabled ? (
            <div style={{ color: '#67e8f9', marginTop: 8, fontSize: 13 }}>
              Auto-reconcile is enabled for this entity by default.
            </div>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <input value={entryNumber} onChange={(e) => setEntryNumber(e.target.value)} placeholder="Entry number" style={inputStyle} />
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} placeholder="Entry date" style={inputStyle} />
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo / description" style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <input value={debitAccount} onChange={(e) => setDebitAccount(e.target.value)} placeholder="Debit account" style={inputStyle} />
            <input value={creditAccount} onChange={(e) => setCreditAccount(e.target.value)} placeholder="Credit account" style={inputStyle} />
          </div>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>Close</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                entryNumber,
                entryDate,
                memo,
                debitAccount,
                creditAccount,
                amount,
              })
            }
            style={buttonStyle}
          >
            Save Journal Entry
          </button>
        </div>
      </div>
    </div>
  );
}
