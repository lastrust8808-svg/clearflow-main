import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { analyzeAccountingUpload } from '../../services/accountingIntake.service';
import { useAuth } from '../../hooks/useAuth';

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
  const { currentUser } = useAuth();
  const [mode, setMode] = useState<'camera' | 'upload' | 'manual'>('upload');
  const [merchantName, setMerchantName] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
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
    setMerchantName('');
    setReceiptDate('');
    setAmount('');
    setCategory('');
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
    !merchantName.trim() ? 'merchant' : '',
    !receiptDate ? 'receipt date' : '',
    !amount || Number(amount) <= 0 ? 'amount' : '',
    !category.trim() ? 'category' : '',
  ].filter(Boolean);
  const canSubmit = missingFields.length === 0;

  const handleExtractUploadedData = async () => {
    if (!uploadedFile) {
      setExtractionSummary('Choose a receipt image, PDF, or statement file first.');
      setExtractionStatus('failed');
      return;
    }

    setIsExtracting(true);
    setExtractionSummary('Reading the uploaded receipt and extracting merchant, amount, and category...');

    try {
      const extraction = await analyzeAccountingUpload('receipt', uploadedFile, {
        accountId: currentUser?.id,
      });
      setMerchantName((current) => current || extraction.vendorOrMerchantName || '');
      setAmount((current) => {
        if (current) {
          return current;
        }
        return typeof extraction.amount === 'number' ? String(extraction.amount) : '';
      });
      setReceiptDate((current) => current || extraction.date || '');
      setCategory((current) => current || extraction.categoryHint || '');
      setDescription((current) => current || extraction.paymentInstructionSummary || '');
      setParsedNotes((current) =>
        [
          current,
          extraction.summary,
          extraction.remitAddress ? `Address: ${extraction.remitAddress}` : '',
          extraction.contactPhone ? `Contact phone: ${extraction.contactPhone}` : '',
          extraction.accountReference ? `Account reference: ${extraction.accountReference}` : '',
        ]
          .filter(Boolean)
          .filter((value, index, all) => all.indexOf(value) === index)
          .join('\n\n'),
      );
      setExtractionSummary(
        extraction.status === 'failed'
          ? 'Extraction could not confidently read the receipt. You can still review and edit the fields before saving.'
          : `${extraction.summary} Review and edit any field before saving the receipt.`,
      );
      setExtractionStatus(extraction.status === 'failed' ? 'failed' : 'complete');
    } catch (error) {
      console.warn('Receipt upload extraction failed.', error);
      setExtractionSummary(
        'Extraction failed on this receipt upload. You can still enter or edit the receipt fields manually.',
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
                setExtractionSummary(
                  file ? 'File loaded. Run extraction to preview and review the uploaded receipt data.' : '',
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
                  file ? 'File loaded. Run extraction to preview and review the uploaded receipt data.' : '',
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
            <input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Merchant / payee" style={inputStyle} />
            <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} placeholder="Receipt date" style={inputStyle} />
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={inputStyle} />
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" style={inputStyle} />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" style={inputStyle} />
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
            disabled={!canSubmit}
          >
            Save Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
