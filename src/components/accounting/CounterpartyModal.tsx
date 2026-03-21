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
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [accountType, setAccountType] = useState<
    'checking' | 'savings' | 'business_checking' | 'other'
  >('business_checking');
  const [railPreference, setRailPreference] = useState<'ach' | 'eft' | 'wire'>('ach');
  const [remittanceEmail, setRemittanceEmail] = useState('');
  const [digitalWalletAddress, setDigitalWalletAddress] = useState('');
  const [digitalWalletNetwork, setDigitalWalletNetwork] = useState('Ethereum');
  const [digitalAssetSymbol, setDigitalAssetSymbol] = useState('');
  const [digitalPayoutTemplate, setDigitalPayoutTemplate] = useState<
    'stablecoin' | 'native_asset' | 'manual_confirmation'
  >('stablecoin');

  useEffect(() => {
    if (!open) return;
    setName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setNotes('');
    setRoutingNumber('');
    setAccountNumber('');
    setBankName('');
    setBeneficiaryName('');
    setAccountType('business_checking');
    setRailPreference('ach');
    setRemittanceEmail('');
    setDigitalWalletAddress('');
    setDigitalWalletNetwork('Ethereum');
    setDigitalAssetSymbol('');
    setDigitalPayoutTemplate('stablecoin');
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
          {mode === 'vendor' ? (
            <div
              style={{
                display: 'grid',
                gap: 12,
                padding: 14,
                borderRadius: 12,
                border: '1px solid rgba(45,212,191,0.25)',
                background: 'rgba(8,47,73,0.28)',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: '#99f6e4' }}>
                Remittance instructions
              </div>
              <div style={{ color: '#cbd5f5', fontSize: 13 }}>
                Save vendor banking details once so ACH, EFT, wire, and ledger-backed remittance can route automatically.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <input value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} placeholder="Beneficiary name" style={inputStyle} />
                <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Receiving bank name" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <input value={routingNumber} onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="Routing number" style={inputStyle} />
                <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 17))} placeholder="Account number" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <select value={accountType} onChange={(e) => setAccountType(e.target.value as typeof accountType)} style={inputStyle}>
                  <option value="business_checking">Business checking</option>
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="other">Other</option>
                </select>
                <select value={railPreference} onChange={(e) => setRailPreference(e.target.value as typeof railPreference)} style={inputStyle}>
                  <option value="ach">ACH</option>
                  <option value="eft">EFT</option>
                  <option value="wire">Wire</option>
                </select>
              </div>
              <input type="email" value={remittanceEmail} onChange={(e) => setRemittanceEmail(e.target.value)} placeholder="Remittance advice email" style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <input value={digitalWalletAddress} onChange={(e) => setDigitalWalletAddress(e.target.value)} placeholder="Digital wallet address (optional)" style={inputStyle} />
                <select value={digitalWalletNetwork} onChange={(e) => setDigitalWalletNetwork(e.target.value)} style={inputStyle}>
                  <option value="Ethereum">Ethereum</option>
                  <option value="Base">Base</option>
                  <option value="Polygon">Polygon</option>
                  <option value="Bitcoin">Bitcoin</option>
                  <option value="Solana">Solana</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <input value={digitalAssetSymbol} onChange={(e) => setDigitalAssetSymbol(e.target.value)} placeholder="Preferred digital asset symbol (USDC, ETH, BTC, SOL)" style={inputStyle} />
                <select
                  value={digitalPayoutTemplate}
                  onChange={(e) => setDigitalPayoutTemplate(e.target.value as typeof digitalPayoutTemplate)}
                  style={inputStyle}
                >
                  <option value="stablecoin">Stablecoin payout</option>
                  <option value="native_asset">Native-asset payout</option>
                  <option value="manual_confirmation">Manual release required</option>
                </select>
              </div>
            </div>
          ) : null}
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
            onClick={() =>
              onSubmit({
                name,
                email,
                phone,
                address,
                notes,
                routingNumber: routingNumber || undefined,
                accountNumber: accountNumber || undefined,
                bankName: bankName || undefined,
                beneficiaryName: beneficiaryName || undefined,
                accountType,
                railPreference,
                remittanceEmail: remittanceEmail || undefined,
                digitalWalletAddress: digitalWalletAddress || undefined,
                digitalWalletNetwork: digitalWalletAddress ? digitalWalletNetwork : undefined,
                digitalAssetSymbol: digitalAssetSymbol || undefined,
                digitalPayoutTemplate: digitalWalletAddress ? digitalPayoutTemplate : undefined,
              })
            }
            style={buttonStyle}
          >
            Save {mode === 'customer' ? 'Customer' : 'Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}
