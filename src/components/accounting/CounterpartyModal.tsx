import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CounterpartySubmitPayload } from './accountingTypes';

interface CounterpartyModalProps {
  open: boolean;
  mode: 'customer' | 'vendor';
  onClose: () => void;
  onSubmit: (payload: CounterpartySubmitPayload) => void;
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
  width: 'min(680px, 100%)',
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

export default function CounterpartyModal({
  open,
  mode,
  onClose,
  onSubmit,
}: CounterpartyModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setNotes('');
  }, [open, mode]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            Add {mode === 'customer' ? 'Customer' : 'Vendor'}
          </div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Create a reusable ERP counterparty record for billing, payments, and settlement tracking.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${mode === 'customer' ? 'Customer' : 'Vendor'} name`} style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" style={inputStyle} />
          </div>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={mode === 'customer' ? 'Billing address' : 'Remit address'} style={inputStyle} />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>Close</button>
          <button
            type="button"
            onClick={() => onSubmit({ name, email, phone, address, notes })}
            style={buttonStyle}
          >
            Save {mode === 'customer' ? 'Customer' : 'Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}
