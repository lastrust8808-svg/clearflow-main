import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { analyzeAccountingUpload } from '../../services/accountingIntake.service';

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
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionSummary, setExtractionSummary] = useState('');
  const [extractionStatus, setExtractionStatus] = useState<'idle' | 'ready' | 'complete' | 'failed'>('idle');

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
    setIsExtracting(false);
    setExtractionSummary('');
    setExtractionStatus('idle');
  }, [open]);

  const missingFields = [
    (mode === 'upload' || mode === 'camera') && !uploadedFile ? 'source file' : '',
    !vendorName.trim() ? 'vendor' : '',
    !dueDate ? 'due date' : '',
    !amount || Number(amount) <= 0 ? 'amount' : '',
    mode === 'manual' && !description.trim() ? 'description' : '',
  ].filter(Boolean);
  const canSubmit = missingFields.length === 0;

  const handleExtractUploadedData = async () => {
    if (!uploadedFile) {
      setExtractionSummary('Choose a bill image, PDF, or statement file first.');
      setExtractionStatus('failed');
      return;
    }

    setIsExtracting(true);
    setExtractionSummary('Reading the uploaded bill and extracting vendor, amount, and due date...');

    try {
      const extraction = await analyzeAccountingUpload('bill', uploadedFile);
      setVendorName((current) => current || extraction.vendorOrMerchantName || '');
      setAmount((current) => {
        if (current) {
          return current;
        }
        return typeof extraction.amount === 'number' ? String(extraction.amount) : '';
      });
      setDueDate((current) => current || extraction.date || '');
      setDescription((current) => current || extraction.categoryHint || '');
      setParsedNotes((current) =>
        [
          current,
          extraction.summary,
          extraction.paymentInstructionSummary,
          extraction.remitAddress ? `Remit address: ${extraction.remitAddress}` : '',
          extraction.contactPhone ? `Contact phone: ${extraction.contactPhone}` : '',
          extraction.accountReference ? `Account reference: ${extraction.accountReference}` : '',
          extraction.processingReference
            ? `Processing reference: ${extraction.processingReference}`
            : '',
        ]
          .filter(Boolean)
          .filter((value, index, all) => all.indexOf(value) === index)
          .join('\n\n'),
      );
      setExtractionSummary(
        extraction.status === 'failed'
          ? 'Extraction could not confidently read the bill. You can still review and edit the fields before saving.'
          : `${extraction.summary} Review and edit any field before saving the bill.`,
      );
      setExtractionStatus(extraction.status === 'failed' ? 'failed' : 'complete');
    } catch (error) {
      console.warn('Bill upload extraction failed.', error);
      setExtractionSummary(
        'Extraction failed on this bill upload. You can still enter or edit the bill fields manually.',
      );
      setExtractionStatus('failed');
    } finally {
      setIsExtracting(false);
    }
  };

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
                setExtractionSummary(
                  file ? 'File loaded. Run extraction to preview and review the uploaded bill data.' : '',
                );
                setExtractionStatus(file ? 'ready' : 'idle');
              }}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void handleExtractUploadedData()}
                style={buttonStyle}
                disabled={!uploadedFile || isExtracting}
              >
                {isExtracting ? 'Extracting...' : 'Extract Uploaded Data'}
              </button>
              {uploadedFileName ? (
                <div style={{ alignSelf: 'center', color: '#94a3b8', fontSize: 13 }}>
                  {uploadedFileName}
                </div>
              ) : null}
            </div>
            {extractionSummary ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border:
                    extractionStatus === 'failed'
                      ? '1px solid rgba(248,113,113,0.28)'
                      : '1px solid rgba(96,165,250,0.24)',
                  background:
                    extractionStatus === 'failed'
                      ? 'rgba(127,29,29,0.18)'
                      : 'rgba(30,41,59,0.4)',
                  color: extractionStatus === 'failed' ? '#fecaca' : '#bfdbfe',
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {extractionSummary}
              </div>
            ) : null}
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
                setExtractionSummary(
                  file ? 'File loaded. Run extraction to preview and review the uploaded bill data.' : '',
                );
                setExtractionStatus(file ? 'ready' : 'idle');
              }}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void handleExtractUploadedData()}
                style={buttonStyle}
                disabled={!uploadedFile || isExtracting}
              >
                {isExtracting ? 'Extracting...' : 'Extract Uploaded Data'}
              </button>
              {uploadedFileName ? (
                <div style={{ alignSelf: 'center', color: '#94a3b8', fontSize: 13 }}>
                  {uploadedFileName}
                </div>
              ) : null}
            </div>
            {extractionSummary ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border:
                    extractionStatus === 'failed'
                      ? '1px solid rgba(248,113,113,0.28)'
                      : '1px solid rgba(96,165,250,0.24)',
                  background:
                    extractionStatus === 'failed'
                      ? 'rgba(127,29,29,0.18)'
                      : 'rgba(30,41,59,0.4)',
                  color: extractionStatus === 'failed' ? '#fecaca' : '#bfdbfe',
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {extractionSummary}
              </div>
            ) : null}
            <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor" style={inputStyle} />
            <input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="Bill number" style={inputStyle} />
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="Due date" style={inputStyle} />
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={inputStyle} />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" style={inputStyle} />
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
          {!canSubmit ? (
            <div style={{ color: '#fca5a5', alignSelf: 'center', fontSize: 13 }}>
              Complete required fields before saving: {missingFields.join(', ')}.
            </div>
          ) : null}
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
            disabled={!canSubmit}
          >
            Save Bill
          </button>
        </div>
      </div>
    </div>
  );
}
