import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { analyzeAccountingUpload } from '../../services/accountingIntake.service';
import type {
  InstrumentSettlementRecord,
  ObligationRecord,
  TreasuryAccountRecord,
  BankAccountRecord,
  LedgerAccountRecord,
} from '../../types/core';
import type { CouponPresentmentSubmitPayload } from './accountingTypes';

interface CouponPresentmentModalProps {
  open: boolean;
  obligations: ObligationRecord[];
  instrumentSettlements: InstrumentSettlementRecord[];
  treasuryAccounts: TreasuryAccountRecord[];
  bankAccounts: BankAccountRecord[];
  ledgerAccounts: LedgerAccountRecord[];
  draft?: {
    title?: string;
    receiverName?: string;
    receiverAccountLabel?: string;
    couponReference?: string;
    presentmentDate?: string;
    dueDate?: string;
    amount?: string;
    obligationId?: string;
    instrumentSettlementId?: string;
    treasuryAccountId?: string;
    sourceBankAccountId?: string;
    sourceLedgerAccountId?: string;
    dischargeMethod?: CouponPresentmentSubmitPayload['dischargeMethod'];
    parsedNotes?: string;
  } | null;
  onClose: () => void;
  onSubmit: (payload: CouponPresentmentSubmitPayload) => void;
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
  width: 'min(860px, 100%)',
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

export default function CouponPresentmentModal({
  open,
  obligations,
  instrumentSettlements,
  treasuryAccounts,
  bankAccounts,
  ledgerAccounts,
  draft,
  onClose,
  onSubmit,
}: CouponPresentmentModalProps) {
  const [mode, setMode] = useState<'camera' | 'upload' | 'manual'>('upload');
  const [title, setTitle] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverAccountLabel, setReceiverAccountLabel] = useState('');
  const [couponReference, setCouponReference] = useState('');
  const [presentmentDate, setPresentmentDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [obligationId, setObligationId] = useState('');
  const [instrumentSettlementId, setInstrumentSettlementId] = useState('');
  const [treasuryAccountId, setTreasuryAccountId] = useState('');
  const [sourceBankAccountId, setSourceBankAccountId] = useState('');
  const [sourceLedgerAccountId, setSourceLedgerAccountId] = useState('');
  const [dischargeMethod, setDischargeMethod] =
    useState<CouponPresentmentSubmitPayload['dischargeMethod']>('instrument_performance');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedNotes, setParsedNotes] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionSummary, setExtractionSummary] = useState('');
  const [extractionStatus, setExtractionStatus] = useState<
    'idle' | 'ready' | 'complete' | 'failed'
  >('idle');

  useEffect(() => {
    if (!open) return;
    setMode('upload');
    setTitle('');
    setReceiverName('');
    setReceiverAccountLabel('');
    setCouponReference('');
    setPresentmentDate(new Date().toISOString().slice(0, 10));
    setDueDate('');
    setAmount('');
    setObligationId('');
    setInstrumentSettlementId('');
    setTreasuryAccountId('');
    setSourceBankAccountId('');
    setSourceLedgerAccountId('');
    setDischargeMethod('instrument_performance');
    setUploadedFileName('');
    setUploadedFile(null);
    setParsedNotes('');
    setIsExtracting(false);
    setExtractionSummary('');
    setExtractionStatus('idle');
  }, [open]);

  useEffect(() => {
    if (!open || !draft) return;

    setTitle(draft.title ?? '');
    setReceiverName(draft.receiverName ?? '');
    setReceiverAccountLabel(draft.receiverAccountLabel ?? '');
    setCouponReference(draft.couponReference ?? '');
    setPresentmentDate(draft.presentmentDate ?? new Date().toISOString().slice(0, 10));
    setDueDate(draft.dueDate ?? '');
    setAmount(draft.amount ?? '');
    setObligationId(draft.obligationId ?? '');
    setInstrumentSettlementId(draft.instrumentSettlementId ?? '');
    setTreasuryAccountId(draft.treasuryAccountId ?? '');
    setSourceBankAccountId(draft.sourceBankAccountId ?? '');
    setSourceLedgerAccountId(draft.sourceLedgerAccountId ?? '');
    setDischargeMethod(draft.dischargeMethod ?? 'instrument_performance');
    setParsedNotes(draft.parsedNotes ?? '');
    setExtractionSummary(draft.parsedNotes ? 'Draft values loaded and ready for review.' : '');
    setExtractionStatus(draft.parsedNotes ? 'complete' : 'idle');
  }, [draft, open]);

  useEffect(() => {
    if (!open || mode === 'manual' || !uploadedFile) {
      return;
    }

    let cancelled = false;
    setIsExtracting(true);
    setExtractionStatus('ready');
    setExtractionSummary('Reading the uploaded coupon and autofilling the review fields...');

    void analyzeAccountingUpload('coupon', uploadedFile)
      .then((extraction) => {
        if (cancelled) {
          return;
        }

        setReceiverName((current) => current || extraction.vendorOrMerchantName || '');
        setAmount((current) => {
          if (current) {
            return current;
          }
          return typeof extraction.amount === 'number' ? String(extraction.amount) : '';
        });
        setDueDate((current) => current || extraction.date || '');
        setTitle((current) => current || extraction.categoryHint || 'Coupon Presentment');
        setParsedNotes((current) =>
          [current, extraction.summary]
            .filter(Boolean)
            .filter((value, index, all) => all.indexOf(value) === index)
            .join('\n\n'),
        );
        setExtractionSummary(
          extraction.status === 'failed'
            ? 'Extraction could not confidently read the upload. You can still edit the fields manually before submit.'
            : `${extraction.summary} Review and edit any field before presenting the coupon.`,
        );
        setExtractionStatus(extraction.status === 'failed' ? 'failed' : 'complete');
      })
      .catch((error) => {
        console.warn('Coupon upload extraction failed.', error);
        if (!cancelled) {
          setExtractionSummary(
            'Extraction failed on this upload. You can still enter or edit the coupon fields manually.',
          );
          setExtractionStatus('failed');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsExtracting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, open, uploadedFile]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Present Coupon / Performance</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Capture a coupon, extract the receiver and amount, then post the presentment into ERP,
            remittance, and settlement control.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setMode('camera')} style={buttonStyle}>Camera</button>
          <button type="button" onClick={() => setMode('upload')} style={buttonStyle}>Upload</button>
          <button type="button" onClick={() => setMode('manual')} style={buttonStyle}>Manual</button>
        </div>

        {(mode === 'camera' || mode === 'upload') ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <input
              type="file"
              accept={mode === 'camera' ? 'image/*' : undefined}
              capture={mode === 'camera' ? 'environment' : undefined}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setUploadedFile(file);
                setUploadedFileName(file?.name ?? '');
                setExtractionSummary(
                  file ? 'File loaded. Autofilling coupon data for review...' : '',
                );
                setExtractionStatus(file ? 'ready' : 'idle');
              }}
              style={inputStyle}
            />
            {uploadedFileName ? (
              <div style={{ alignSelf: 'center', color: '#94a3b8', fontSize: 13 }}>
                {uploadedFileName}
              </div>
            ) : null}
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
                  color:
                    extractionStatus === 'failed' ? '#fecaca' : '#bfdbfe',
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {isExtracting ? 'Extracting upload. ' : ''}
                {extractionSummary}
              </div>
            ) : null}
            <textarea
              value={parsedNotes}
              onChange={(event) => setParsedNotes(event.target.value)}
              placeholder="Extraction notes / operator notes"
              style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
            />
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Presentment title"
            style={inputStyle}
          />
          <input
            value={couponReference}
            onChange={(event) => setCouponReference(event.target.value)}
            placeholder="Coupon / reference number"
            style={inputStyle}
          />
          <input
            value={receiverName}
            onChange={(event) => setReceiverName(event.target.value)}
            placeholder="Receiver / payee"
            style={inputStyle}
          />
          <input
            value={receiverAccountLabel}
            onChange={(event) => setReceiverAccountLabel(event.target.value)}
            placeholder="Receiver account label"
            style={inputStyle}
          />
          <input
            type="date"
            value={presentmentDate}
            onChange={(event) => setPresentmentDate(event.target.value)}
            style={inputStyle}
          />
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            style={inputStyle}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Coupon amount"
            style={inputStyle}
          />
          <select
            value={dischargeMethod}
            onChange={(event) =>
              setDischargeMethod(event.target.value as CouponPresentmentSubmitPayload['dischargeMethod'])
            }
            style={inputStyle}
          >
            <option value="instrument_performance">Instrument performance</option>
            <option value="internal_ledger_credit">Internal ledger credit</option>
            <option value="bank_rail_payment">Bank rail payment</option>
            <option value="mixed_discharge">Mixed discharge</option>
          </select>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <select
            value={obligationId}
            onChange={(event) => setObligationId(event.target.value)}
            style={inputStyle}
          >
            <option value="">Link obligation</option>
            {obligations.map((record) => (
              <option key={record.id} value={record.id}>
                {record.title}
              </option>
            ))}
          </select>
          <select
            value={instrumentSettlementId}
            onChange={(event) => setInstrumentSettlementId(event.target.value)}
            style={inputStyle}
          >
            <option value="">Link instrument settlement</option>
            {instrumentSettlements.map((record) => (
              <option key={record.id} value={record.id}>
                {record.title}
              </option>
            ))}
          </select>
          <select
            value={treasuryAccountId}
            onChange={(event) => setTreasuryAccountId(event.target.value)}
            style={inputStyle}
          >
            <option value="">Treasury source</option>
            {treasuryAccounts.map((record) => (
              <option key={record.id} value={record.id}>
                {record.name}
              </option>
            ))}
          </select>
          <select
            value={sourceBankAccountId}
            onChange={(event) => setSourceBankAccountId(event.target.value)}
            style={inputStyle}
          >
            <option value="">Bank source</option>
            {bankAccounts.map((record) => (
              <option key={record.id} value={record.id}>
                {record.accountName} - {record.institutionName}
              </option>
            ))}
          </select>
          <select
            value={sourceLedgerAccountId}
            onChange={(event) => setSourceLedgerAccountId(event.target.value)}
            style={inputStyle}
          >
            <option value="">Ledger remittance source</option>
            {ledgerAccounts.map((record) => (
              <option key={record.id} value={record.id}>
                {record.code} - {record.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>Close</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                mode,
                title,
                receiverName,
                receiverAccountLabel,
                couponReference,
                presentmentDate,
                dueDate,
                amount,
                obligationId: obligationId || undefined,
                instrumentSettlementId: instrumentSettlementId || undefined,
                treasuryAccountId: treasuryAccountId || undefined,
                sourceBankAccountId: sourceBankAccountId || undefined,
                sourceLedgerAccountId: sourceLedgerAccountId || undefined,
                dischargeMethod,
                uploadedFileName,
                uploadedFile,
                parsedNotes,
              })
            }
            style={buttonStyle}
          >
            Present Coupon
          </button>
        </div>
      </div>
    </div>
  );
}
