import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  analyzeAccountingUpload,
  getCachedAccountingExtraction,
  type IntakeExtractionResult,
} from '../../services/accountingIntake.service';
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
    mode?: 'camera' | 'upload' | 'manual';
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
    useRecognizedRemittanceSource?: boolean;
    dischargeMethod?: CouponPresentmentSubmitPayload['dischargeMethod'];
    uploadedFileName?: string;
    parsedNotes?: string;
  } | null;
  onClose: () => void;
  onSubmit: (payload: CouponPresentmentSubmitPayload) => void;
  onSaveDraft: (draft: NonNullable<CouponPresentmentModalProps['draft']>) => void;
  onDraftChange: (draft: NonNullable<CouponPresentmentModalProps['draft']> | null) => void;
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
  onSaveDraft,
  onDraftChange,
}: CouponPresentmentModalProps) {
  const hasHydratedDraftRef = useRef(false);
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
  const [useRecognizedRemittanceSource, setUseRecognizedRemittanceSource] = useState(true);
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

  const applyExtractionResult = (
    extraction: IntakeExtractionResult,
    options?: { fromCache?: boolean; cachedAt?: string }
  ) => {
    setReceiverName((current) => current || extraction.vendorOrMerchantName || '');
    setReceiverAccountLabel((current) => current || extraction.accountReference || '');
    setCouponReference((current) => current || extraction.processingReference || '');
    setAmount((current) => {
      if (current) {
        return current;
      }
      return typeof extraction.amount === 'number' ? String(extraction.amount) : '';
    });
    setDueDate((current) => current || extraction.date || '');
    setTitle((current) => current || extraction.categoryHint || 'Coupon Presentment');
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
      options?.fromCache
        ? `Saved extraction restored${options.cachedAt ? ` from ${new Date(options.cachedAt).toLocaleString()}` : ''}. Review and edit any field before presenting the coupon.`
        : extraction.status === 'failed'
          ? 'Extraction could not confidently read the upload. You can still edit the fields manually before submit.'
          : `${extraction.summary} Review and edit any field before presenting the coupon.`,
    );
    setExtractionStatus(extraction.status === 'failed' ? 'failed' : 'complete');
  };

  useEffect(() => {
    if (!open) return;
    hasHydratedDraftRef.current = false;
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
    setUseRecognizedRemittanceSource(true);
    setDischargeMethod('instrument_performance');
    setUploadedFileName('');
    setUploadedFile(null);
    setParsedNotes('');
    setIsExtracting(false);
    setExtractionSummary('');
    setExtractionStatus('idle');
  }, [open]);

  useEffect(() => {
    if (!open || !draft || hasHydratedDraftRef.current) return;

    hasHydratedDraftRef.current = true;

    setMode(draft.mode ?? 'upload');
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
    setUseRecognizedRemittanceSource(draft.useRecognizedRemittanceSource ?? true);
    setDischargeMethod(draft.dischargeMethod ?? 'instrument_performance');
    setUploadedFileName(draft.uploadedFileName ?? '');
    setParsedNotes(draft.parsedNotes ?? '');
    setExtractionSummary(draft.parsedNotes ? 'Draft values loaded and ready for review.' : '');
    setExtractionStatus(draft.parsedNotes ? 'complete' : 'idle');
  }, [draft, open]);

  const usesObligationBackedSource =
    (Boolean(obligationId) || useRecognizedRemittanceSource) &&
    dischargeMethod !== 'bank_rail_payment';
  const hasFundingSource = Boolean(
    treasuryAccountId || sourceBankAccountId || sourceLedgerAccountId || usesObligationBackedSource,
  );
  const missingFields = [
    (mode === 'upload' || mode === 'camera') && !uploadedFile && !uploadedFileName
      ? 'source file'
      : '',
    !title.trim() ? 'presentment title' : '',
    !couponReference.trim() ? 'coupon/reference number' : '',
    !receiverName.trim() ? 'receiver/payee' : '',
    !receiverAccountLabel.trim() ? 'receiver account label' : '',
    !presentmentDate ? 'presentment date' : '',
    !dueDate ? 'due date' : '',
    !amount || Number(amount) <= 0 ? 'amount' : '',
    !hasFundingSource
      ? dischargeMethod === 'bank_rail_payment'
        ? 'bank, treasury, or ledger funding source'
        : 'funding source or linked obligation'
      : '',
  ].filter(Boolean);
  const canSubmit = missingFields.length === 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextDraft = {
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
      useRecognizedRemittanceSource,
      dischargeMethod,
      uploadedFileName,
      parsedNotes,
    } satisfies NonNullable<CouponPresentmentModalProps['draft']>;

    const hasMeaningfulProgress = Boolean(
      uploadedFileName ||
        title.trim() ||
        receiverName.trim() ||
        receiverAccountLabel.trim() ||
        couponReference.trim() ||
        dueDate ||
        amount ||
        obligationId ||
        instrumentSettlementId ||
        treasuryAccountId ||
        sourceBankAccountId ||
        sourceLedgerAccountId ||
        useRecognizedRemittanceSource ||
        parsedNotes.trim()
    );

    onDraftChange(hasMeaningfulProgress ? nextDraft : null);
  }, [
    amount,
    couponReference,
    dischargeMethod,
    dueDate,
    instrumentSettlementId,
    obligationId,
    onDraftChange,
    open,
    parsedNotes,
    presentmentDate,
    receiverAccountLabel,
    receiverName,
    sourceBankAccountId,
    sourceLedgerAccountId,
    title,
    treasuryAccountId,
    uploadedFileName,
    useRecognizedRemittanceSource,
    mode,
  ]);

  const handleExtractUploadedData = async (fileOverride?: File | null) => {
    const fileToExtract = fileOverride ?? uploadedFile;

    if (!fileToExtract) {
      setExtractionSummary('Choose a coupon or utility statement file first.');
      setExtractionStatus('failed');
      return;
    }

    setIsExtracting(true);
    setExtractionSummary('Reading the uploaded coupon and extracting receiver, amount, and date data...');

    try {
      const extraction = await analyzeAccountingUpload('coupon', fileToExtract);
      applyExtractionResult(extraction);
    } catch (error) {
      console.warn('Coupon upload extraction failed.', error);
      setExtractionSummary(
        'Extraction failed on this upload. You can still enter or edit the coupon fields manually.',
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
                if (!file) {
                  setExtractionSummary('');
                  setExtractionStatus('idle');
                  return;
                }

                const cachedExtraction = getCachedAccountingExtraction('coupon', file);
                if (cachedExtraction.result) {
                  applyExtractionResult(cachedExtraction.result, {
                    fromCache: true,
                    cachedAt: cachedExtraction.savedAt,
                  });
                } else {
                  setExtractionSummary(
                    'File loaded. Extracting receiver, amount, and reference data now...',
                  );
                  setExtractionStatus('ready');
                  void handleExtractUploadedData(file);
                }
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
                  color:
                    extractionStatus === 'failed' ? '#fecaca' : '#bfdbfe',
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
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

        {usesObligationBackedSource ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: '1px solid rgba(96,165,250,0.24)',
              background: 'rgba(30,41,59,0.4)',
              color: '#bfdbfe',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Linked obligation selected. ClearFlow can use the recognized remittance / obligation
            rail as the source for this presentment unless you explicitly choose a treasury, bank,
            or ledger source.
          </div>
        ) : null}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.2)',
            background: 'rgba(15,23,42,0.32)',
            color: '#cbd5e1',
            fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            checked={useRecognizedRemittanceSource}
            onChange={(event) => setUseRecognizedRemittanceSource(event.target.checked)}
            disabled={dischargeMethod === 'bank_rail_payment'}
          />
          Use this remittance / presentment itself as the recognized source rail when no linked
          obligation or explicit account source has been selected.
        </label>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {!canSubmit ? (
            <div style={{ color: '#fca5a5', alignSelf: 'center', fontSize: 13 }}>
              Complete required fields before presenting: {missingFields.join(', ')}.
            </div>
          ) : null}
          <button
            type="button"
            onClick={() =>
              onSaveDraft({
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
                useRecognizedRemittanceSource,
                dischargeMethod,
                uploadedFileName,
                parsedNotes,
              })
            }
            style={buttonStyle}
          >
            Save for Later
          </button>
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
                useRecognizedRemittanceSource,
                dischargeMethod,
                uploadedFileName,
                uploadedFile,
                parsedNotes,
              })
            }
            style={buttonStyle}
            disabled={!canSubmit}
          >
            Present Coupon
          </button>
        </div>
      </div>
    </div>
  );
}
