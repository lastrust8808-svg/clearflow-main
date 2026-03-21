import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

interface BillIntakeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    mode: 'camera' | 'upload' | 'manual';
    vendorName: string;
    billNumber: string;
    dueDate: string;
    amount: string;
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

export default function BillIntakeModal({ open, onClose, onSubmit }: BillIntakeModalProps) {
  const [mode, setMode] = useState<'camera' | 'upload' | 'manual'>('upload');
  const [vendorName, setVendorName] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedNotes, setParsedNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('upload');
    setVendorName('');
    setBillNumber('');
    setDueDate('');
    setAmount('');
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
          <div style={{ fontSize: 22, fontWeight: 700 }}>Add Bill</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Camera, upload, or manual entry for bill intake.
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
              Capture a bill image from a mobile device or upload a scan directly into the ERP vault.
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
            <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor" style={inputStyle} />
            <input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="Bill number" style={inputStyle} />
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={inputStyle} />
            <textarea
              value={parsedNotes}
              onChange={(e) => setParsedNotes(e.target.value)}
              placeholder="Parsed bill data preview / notes"
              style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
            />
          </div>
        )}

        {mode === 'manual' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor" style={inputStyle} />
            <input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="Bill number" style={inputStyle} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="Due date" style={inputStyle} />
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={inputStyle} />
            </div>
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
                vendorName,
                billNumber,
                dueDate,
                amount,
                description,
                uploadedFileName,
                uploadedFile,
                parsedNotes,
              })
            }
            style={buttonStyle}
          >
            Save Bill
          </button>
        </div>
      </div>
    </div>
  );
}
