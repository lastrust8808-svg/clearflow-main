import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

interface ReceiptIntakeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    mode: 'camera' | 'upload' | 'manual';
    merchantName: string;
    receiptDate: string;
    amount: string;
    category: string;
    description: string;
    uploadedFileName: string;
    uploadedFile?: File | null;
    parsedNotes: string;
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

export default function ReceiptIntakeModal({ open, onClose, onSubmit }: ReceiptIntakeModalProps) {
  const [mode, setMode] = useState<'camera' | 'upload' | 'manual'>('upload');
  const [merchantName, setMerchantName] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedNotes, setParsedNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('upload');
    setMerchantName('');
    setReceiptDate('');
    setAmount('');
    setCategory('');
    setDescription('');
    setUploadedFileName('');
    setUploadedFile(null);
    setParsedNotes('');
  }, [open]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Add Receipt</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Camera, upload, or manual entry for receipt intake.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setMode('camera')} style={buttonStyle}>Camera</button>
          <button type="button" onClick={() => setMode('upload')} style={buttonStyle}>Upload</button>
          <button type="button" onClick={() => setMode('manual')} style={buttonStyle}>Manual</button>
        </div>

        {mode === 'camera' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
              Capture a receipt image directly into the ERP vault for later extraction and review.
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setUploadedFile(file);
                setUploadedFileName(file?.name ?? '');
              }}
              style={inputStyle}
            />
          </div>
        )}

        {mode === 'upload' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setUploadedFile(file);
                setUploadedFileName(file?.name ?? '');
              }}
              style={inputStyle}
            />
            <input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Merchant / payee" style={inputStyle} />
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={inputStyle} />
            <textarea
              value={parsedNotes}
              onChange={(e) => setParsedNotes(e.target.value)}
              placeholder="Parsed receipt data preview / notes"
              style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
            />
          </div>
        )}

        {mode === 'manual' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Merchant / payee" style={inputStyle} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} placeholder="Receipt date" style={inputStyle} />
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={inputStyle} />
            </div>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" style={inputStyle} />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>Close</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                mode,
                merchantName,
                receiptDate,
                amount,
                category,
                description,
                uploadedFileName,
                uploadedFile,
                parsedNotes,
              })
            }
            style={buttonStyle}
          >
            Save Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
