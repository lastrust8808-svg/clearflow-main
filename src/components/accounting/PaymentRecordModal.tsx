import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BillRecord, CustomerRecord, InvoiceRecord, VendorRecord } from '../../types/core';
import type { PaymentSubmitPayload } from './accountingTypes';

type PaymentMethod =
  'ach'
  | 'wire'
  | 'check'
  | 'card'
  | 'cash'
  | 'digital_asset'
  | 'other';

interface PaymentRecordModalProps {
  open: boolean;
  customers: CustomerRecord[];
  vendors: VendorRecord[];
  invoices: InvoiceRecord[];
  bills: BillRecord[];
  onClose: () => void;
  onSubmit: (payload: PaymentSubmitPayload) => void;
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

export default function PaymentRecordModal({
  open,
  customers,
  vendors,
  invoices,
  bills,
  onClose,
  onSubmit,
}: PaymentRecordModalProps) {
  const [direction, setDirection] = useState<'incoming' | 'outgoing'>('incoming');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('ach');
  const [linkedInvoiceId, setLinkedInvoiceId] = useState('');
  const [linkedBillId, setLinkedBillId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setDirection('incoming');
    setCounterpartyId('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAmount('');
    setMethod('ach');
    setLinkedInvoiceId('');
    setLinkedBillId('');
    setNotes('');
  }, [open]);

  const counterpartyOptions = useMemo(
    () => (direction === 'incoming' ? customers : vendors),
    [customers, direction, vendors]
  );

  const documentOptions = useMemo(
    () => (direction === 'incoming' ? invoices.filter((item) => item.balanceDue > 0) : bills.filter((item) => item.balanceDue > 0)),
    [bills, direction, invoices]
  );

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Record Payment</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Post incoming collections or outgoing disbursements and apply them to open ERP documents.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'incoming' | 'outgoing')} style={inputStyle}>
            <option value="incoming">Incoming payment</option>
            <option value="outgoing">Outgoing payment</option>
          </select>
          <select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)} style={inputStyle}>
            <option value="">Select {direction === 'incoming' ? 'customer' : 'vendor'}</option>
            {counterpartyOptions.map((record) => (
              <option key={record.id} value={record.id}>{record.name}</option>
            ))}
          </select>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={inputStyle} />
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} style={inputStyle}>
            <option value="ach">ACH</option>
            <option value="wire">Wire</option>
            <option value="check">Check</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="digital_asset">Digital asset</option>
            <option value="other">Other</option>
          </select>
          {direction === 'incoming' ? (
            <select value={linkedInvoiceId} onChange={(e) => setLinkedInvoiceId(e.target.value)} style={inputStyle}>
              <option value="">Apply to open invoice</option>
              {documentOptions.map((record) => (
                <option key={record.id} value={record.id}>
                  {(record as InvoiceRecord).invoiceNumber} · {(record as InvoiceRecord).balanceDue}
                </option>
              ))}
            </select>
          ) : (
            <select value={linkedBillId} onChange={(e) => setLinkedBillId(e.target.value)} style={inputStyle}>
              <option value="">Apply to open bill</option>
              {documentOptions.map((record) => (
                <option key={record.id} value={record.id}>
                  {(record as BillRecord).billNumber || record.id} · {(record as BillRecord).balanceDue}
                </option>
              ))}
            </select>
          )}
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Remittance / memo"
          style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>Close</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                direction,
                counterpartyType: direction === 'incoming' ? 'customer' : 'vendor',
                counterpartyId: counterpartyId || undefined,
                paymentDate,
                amount,
                method,
                linkedInvoiceId: linkedInvoiceId || undefined,
                linkedBillId: linkedBillId || undefined,
                notes,
              })
            }
            style={buttonStyle}
          >
            Post Payment
          </button>
        </div>
      </div>
    </div>
  );
}
