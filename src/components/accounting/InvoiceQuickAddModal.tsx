import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  entityBrandProfileOptions,
  invoiceDeliveryOptions,
  invoicePresetOptions,
  jurisdictionOptions,
  jurisdictionTaxRates,
  numberingModeOptions,
  paymentRailOptions,
  paymentTermsOptions,
  taxModeOptions,
} from '../../data/accountingPresets';

interface InvoiceQuickAddModalProps {
  open: boolean;
  onClose: () => void;
  defaultEntityName?: string;
  defaultThemeColor?: string;
  defaultLogoName?: string;
  defaultFooterNote?: string;
  defaultStartingNumber?: string;
  defaultJurisdiction?: string;
  defaultPaymentRailPreference?: 'ach' | 'wire' | 'card' | 'digital_asset' | 'manual';
  defaultAcceptsDigitalAssets?: boolean;
  onSubmit: (payload: {
    mode: 'quick' | 'custom' | 'template';
    preset: string;
    entityProfileKey: string;
    customerName: string;
    deliveryMethod: 'internal_user' | 'email' | 'export' | 'manual';
    recipientEmail: string;
    internalDeliveryTarget: string;
    invoiceNumberMode: 'auto' | 'manual';
    manualInvoiceNumber: string;
    startingNumber: string;
    issueDate: string;
    dueDate: string;
    paymentTerms: string;
    lineDescription: string;
    amount: string;
    taxMode: 'none' | 'state';
    jurisdiction: string;
    notes: string;
    themeColor: string;
    logoName: string;
    headerStyle: string;
    footerNote: string;
    templateName: string;
    paymentRailPreference: 'ach' | 'wire' | 'card' | 'digital_asset' | 'manual';
    paymentInstructions: string;
    paymentLinkLabel: string;
    acceptsDigitalAssets: boolean;
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

const actionButtonStyle: CSSProperties = {
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.4)',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontWeight: 600,
};

export default function InvoiceQuickAddModal({
  open,
  onClose,
  defaultEntityName,
  defaultThemeColor,
  defaultLogoName,
  defaultFooterNote,
  defaultStartingNumber,
  defaultJurisdiction,
  defaultPaymentRailPreference,
  defaultAcceptsDigitalAssets,
  onSubmit,
}: InvoiceQuickAddModalProps) {
  const [mode, setMode] = useState<'quick' | 'custom' | 'template'>('quick');
  const [preset, setPreset] = useState('general');
  const [entityProfileKey, setEntityProfileKey] = useState('primary');
  const [customerName, setCustomerName] = useState('');
  const [deliveryMethod, setDeliveryMethod] =
    useState<'internal_user' | 'email' | 'export' | 'manual'>('email');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [internalDeliveryTarget, setInternalDeliveryTarget] = useState('');
  const [invoiceNumberMode, setInvoiceNumberMode] = useState<'auto' | 'manual'>('auto');
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState('');
  const [startingNumber, setStartingNumber] = useState('1000');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('net_30');
  const [lineDescription, setLineDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [taxMode, setTaxMode] = useState<'none' | 'state'>('none');
  const [jurisdiction, setJurisdiction] = useState('MI');
  const [notes, setNotes] = useState('');
  const [themeColor, setThemeColor] = useState('');
  const [logoName, setLogoName] = useState('');
  const [headerStyle, setHeaderStyle] = useState('');
  const [footerNote, setFooterNote] = useState('');
  const [templateName, setTemplateName] = useState('general');
  const [paymentRailPreference, setPaymentRailPreference] =
    useState<'ach' | 'wire' | 'card' | 'digital_asset' | 'manual'>('ach');
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [paymentLinkLabel, setPaymentLinkLabel] = useState('Pay Invoice');
  const [acceptsDigitalAssets, setAcceptsDigitalAssets] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('quick');
    setPreset('general');
    setEntityProfileKey('primary');
    setCustomerName('');
    setDeliveryMethod('email');
    setRecipientEmail('');
    setInternalDeliveryTarget('');
    setInvoiceNumberMode('auto');
    setManualInvoiceNumber('');
    setStartingNumber(defaultStartingNumber || '1000');
    setIssueDate('');
    setDueDate('');
    setPaymentTerms('net_30');
    setLineDescription('');
    setAmount('');
    setTaxMode('none');
    setJurisdiction(defaultJurisdiction || 'MI');
    setNotes('');
    setThemeColor(defaultThemeColor || '');
    setLogoName(defaultLogoName || '');
    setHeaderStyle('');
    setFooterNote(defaultFooterNote || '');
    setTemplateName('general');
    setPaymentRailPreference(defaultPaymentRailPreference || 'ach');
    setPaymentInstructions(defaultFooterNote || '');
    setPaymentLinkLabel('Pay Invoice');
    setAcceptsDigitalAssets(defaultAcceptsDigitalAssets ?? false);
  }, [
    defaultAcceptsDigitalAssets,
    defaultFooterNote,
    defaultJurisdiction,
    defaultLogoName,
    defaultPaymentRailPreference,
    defaultStartingNumber,
    defaultThemeColor,
    open,
  ]);

  const baseAmount = Number(amount || 0);
  const taxPercent = taxMode === 'state' ? jurisdictionTaxRates[jurisdiction] ?? 0 : 0;
  const taxAmount = useMemo(() => baseAmount * taxPercent, [baseAmount, taxPercent]);
  const totalAmount = useMemo(() => baseAmount + taxAmount, [baseAmount, taxAmount]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>New Invoice</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Preset-driven invoice builder with numbering, branding profile, and tax logic.
          </div>
          {defaultEntityName ? (
            <div style={{ color: '#67e8f9', marginTop: 8, fontSize: 13 }}>
              Defaulting to {defaultEntityName} profile settings.
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setMode('quick')} style={actionButtonStyle}>Quick Add</button>
          <button type="button" onClick={() => setMode('custom')} style={actionButtonStyle}>Custom Branded</button>
          <button type="button" onClick={() => setMode('template')} style={actionButtonStyle}>General Template</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={inputStyle}>
            {invoicePresetOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select value={entityProfileKey} onChange={(e) => setEntityProfileKey(e.target.value)} style={inputStyle}>
            {entityBrandProfileOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            value={deliveryMethod}
            onChange={(e) =>
              setDeliveryMethod(e.target.value as 'internal_user' | 'email' | 'export' | 'manual')
            }
            style={inputStyle}
          >
            {invoiceDeliveryOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            value={invoiceNumberMode}
            onChange={(e) => setInvoiceNumberMode(e.target.value as 'auto' | 'manual')}
            style={inputStyle}
          >
            {numberingModeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          {invoiceNumberMode === 'manual' ? (
            <input value={manualInvoiceNumber} onChange={(e) => setManualInvoiceNumber(e.target.value)} placeholder="Manual invoice number" style={inputStyle} />
          ) : (
            <input value={startingNumber} onChange={(e) => setStartingNumber(e.target.value)} placeholder="Starting number" style={inputStyle} />
          )}
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer / client name" style={inputStyle} />

          {deliveryMethod === 'email' ? (
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Recipient email"
              style={inputStyle}
            />
          ) : null}

          {deliveryMethod === 'internal_user' ? (
            <input
              value={internalDeliveryTarget}
              onChange={(e) => setInternalDeliveryTarget(e.target.value)}
              placeholder="Internal ClearFlow user / member target"
              style={inputStyle}
            />
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} placeholder="Issue date" style={inputStyle} />
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="Due date" style={inputStyle} />
            <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} style={inputStyle}>
              {paymentTermsOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <input value={lineDescription} onChange={(e) => setLineDescription(e.target.value)} placeholder="Line description / scope of work" style={inputStyle} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Subtotal amount" style={inputStyle} />

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
            <div>Delivery: <strong>{deliveryMethod}</strong></div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#dbeafe',
            }}
          >
            Digital Invoice Setup
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <select
              value={paymentRailPreference}
              onChange={(e) =>
                setPaymentRailPreference(
                  e.target.value as 'ach' | 'wire' | 'card' | 'digital_asset' | 'manual'
                )
              }
              style={inputStyle}
            >
              {paymentRailOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              value={paymentLinkLabel}
              onChange={(e) => setPaymentLinkLabel(e.target.value)}
              placeholder="Payment button / link label"
              style={inputStyle}
            />
          </div>
          <textarea
            value={paymentInstructions}
            onChange={(e) => setPaymentInstructions(e.target.value)}
            placeholder="ACH details, wire note, wallet request, or remittance instructions"
            style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
          />
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#d1d5db' }}>
            <input
              type="checkbox"
              checked={acceptsDigitalAssets}
              onChange={(e) => setAcceptsDigitalAssets(e.target.checked)}
            />
            Accept digital asset settlement for this invoice
          </label>
        </div>

        {mode === 'custom' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <input value={themeColor} onChange={(e) => setThemeColor(e.target.value)} placeholder="Theme color override" style={inputStyle} />
              <input value={logoName} onChange={(e) => setLogoName(e.target.value)} placeholder="Logo override / placeholder" style={inputStyle} />
              <input value={headerStyle} onChange={(e) => setHeaderStyle(e.target.value)} placeholder="Header style" style={inputStyle} />
            </div>
            <input value={footerNote} onChange={(e) => setFooterNote(e.target.value)} placeholder="Footer / payment instructions" style={inputStyle} />
          </div>
        )}

        {mode === 'template' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <select value={templateName} onChange={(e) => setTemplateName(e.target.value)} style={inputStyle}>
              {invoicePresetOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        )}

        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes / internal instructions / footer detail" style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={actionButtonStyle}>Close</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                mode,
                preset,
                entityProfileKey,
                customerName,
                deliveryMethod,
                recipientEmail,
                internalDeliveryTarget,
                invoiceNumberMode,
                manualInvoiceNumber,
                startingNumber,
                issueDate,
                dueDate,
                paymentTerms,
                lineDescription,
                amount,
                taxMode,
                jurisdiction,
                notes,
                themeColor,
                logoName,
                headerStyle,
                footerNote,
                templateName,
                paymentRailPreference,
                paymentInstructions,
                paymentLinkLabel,
                acceptsDigitalAssets,
              })
            }
            style={actionButtonStyle}
          >
            Save Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
