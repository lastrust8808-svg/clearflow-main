import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  entityBrandProfileOptions,
  jurisdictionOptions,
  jurisdictionTaxRates,
  numberingModeOptions,
  quotePresetOptions,
  taxModeOptions,
} from '../../data/accountingPresets';

interface QuoteBuilderModalProps {
  open: boolean;
  onClose: () => void;
  defaultEntityName?: string;
  defaultThemeColor?: string;
  defaultLogoName?: string;
  defaultStartingNumber?: string;
  defaultJurisdiction?: string;
  onSubmit: (payload: {
    preset: string;
    entityProfileKey: string;
    customerName: string;
    quoteNumberMode: 'auto' | 'manual';
    manualQuoteNumber: string;
    startingNumber: string;
    projectTitle: string;
    amount: string;
    notes: string;
    themeColor: string;
    logoName: string;
    taxMode: 'none' | 'state';
    jurisdiction: string;
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
  width: 'min(920px, 100%)',
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

export default function QuoteBuilderModal({
  open,
  onClose,
  defaultEntityName,
  defaultThemeColor,
  defaultLogoName,
  defaultStartingNumber,
  defaultJurisdiction,
  onSubmit,
}: QuoteBuilderModalProps) {
  const [preset, setPreset] = useState('general');
  const [entityProfileKey, setEntityProfileKey] = useState('primary');
  const [customerName, setCustomerName] = useState('');
  const [quoteNumberMode, setQuoteNumberMode] = useState<'auto' | 'manual'>('auto');
  const [manualQuoteNumber, setManualQuoteNumber] = useState('');
  const [startingNumber, setStartingNumber] = useState('1000');
  const [projectTitle, setProjectTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [themeColor, setThemeColor] = useState('');
  const [logoName, setLogoName] = useState('');
  const [taxMode, setTaxMode] = useState<'none' | 'state'>('none');
  const [jurisdiction, setJurisdiction] = useState('MI');

  useEffect(() => {
    if (!open) return;
    setPreset('general');
    setEntityProfileKey('primary');
    setCustomerName('');
    setQuoteNumberMode('auto');
    setManualQuoteNumber('');
    setStartingNumber(defaultStartingNumber || '1000');
    setProjectTitle('');
    setAmount('');
    setNotes('');
    setThemeColor(defaultThemeColor || '');
    setLogoName(defaultLogoName || '');
    setTaxMode('none');
    setJurisdiction(defaultJurisdiction || 'MI');
  }, [defaultJurisdiction, defaultLogoName, defaultStartingNumber, defaultThemeColor, open]);

  const baseAmount = Number(amount || 0);
  const taxPercent = taxMode === 'state' ? jurisdictionTaxRates[jurisdiction] ?? 0 : 0;
  const taxAmount = useMemo(() => baseAmount * taxPercent, [baseAmount, taxPercent]);
  const totalAmount = useMemo(() => baseAmount + taxAmount, [baseAmount, taxAmount]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Generate Quote</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Preset-based estimate builder with entity branding profile and jurisdiction-aware tax preview.
          </div>
          {defaultEntityName ? (
            <div style={{ color: '#67e8f9', marginTop: 8, fontSize: 13 }}>
              Using {defaultEntityName} as the default quote profile.
            </div>
          ) : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={inputStyle}>
            {quotePresetOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select value={entityProfileKey} onChange={(e) => setEntityProfileKey(e.target.value)} style={inputStyle}>
            {entityBrandProfileOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            value={quoteNumberMode}
            onChange={(e) => setQuoteNumberMode(e.target.value as 'auto' | 'manual')}
            style={inputStyle}
          >
            {numberingModeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          {quoteNumberMode === 'manual' ? (
            <input value={manualQuoteNumber} onChange={(e) => setManualQuoteNumber(e.target.value)} placeholder="Manual quote number" style={inputStyle} />
          ) : (
            <input value={startingNumber} onChange={(e) => setStartingNumber(e.target.value)} placeholder="Starting quote number" style={inputStyle} />
          )}
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer / client name" style={inputStyle} />
          <input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="Project title / estimate subject" style={inputStyle} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Subtotal amount" style={inputStyle} />

            <select value={taxMode} onChange={(e) => setTaxMode(e.target.value as 'none' | 'state')} style={inputStyle}>
              {taxModeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} style={inputStyle}>
              {jurisdictionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <input value={themeColor} onChange={(e) => setThemeColor(e.target.value)} placeholder="Theme color override" style={inputStyle} />
            <input value={logoName} onChange={(e) => setLogoName(e.target.value)} placeholder="Logo override / placeholder" style={inputStyle} />
          </div>

          <div
            style={{
              border: '1px solid rgba(148,163,184,0.2)',
              borderRadius: 12,
              padding: 14,
              background: 'rgba(15,23,42,0.35)',
              color: '#d1d5db',
              lineHeight: 1.7,
            }}
          >
            <div>Brand profile: <strong>{entityProfileKey}</strong></div>
            <div>Tax rate: <strong>{(taxPercent * 100).toFixed(2)}%</strong></div>
            <div>Tax amount: <strong>${taxAmount.toLocaleString()}</strong></div>
            <div>Total: <strong>${totalAmount.toLocaleString()}</strong></div>
          </div>
        </div>

        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope / notes / exclusions / estimate detail" style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>Close</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                preset,
                entityProfileKey,
                customerName,
                quoteNumberMode,
                manualQuoteNumber,
                startingNumber,
                projectTitle,
                amount,
                notes,
                themeColor,
                logoName,
                taxMode,
                jurisdiction,
              })
            }
            style={buttonStyle}
          >
            Save Quote
          </button>
        </div>
      </div>
    </div>
  );
}
