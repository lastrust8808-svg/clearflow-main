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
  const [organizationClass, setOrganizationClass] = useState<
    'general' | 'large_bank' | 'large_corporation' | 'utility' | 'government' | 'servicer'
  >('general');
  const [termsIntakeMode, setTermsIntakeMode] = useState<
    'none' | 'auto_load' | 'upload_contract' | 'manual_reference'
  >('none');
  const [billingErrorSupport, setBillingErrorSupport] = useState(false);
  const [disputeResolutionPath, setDisputeResolutionPath] = useState<
    'none' | 'notice_and_cure' | 'notice_mediation_arbitration' | 'notice_arbitration' | 'court_litigation'
  >('none');
  const [arbitrationForum, setArbitrationForum] = useState<
    'aaa' | 'jams' | 'private_forum' | 'court_only' | 'unspecified'
  >('unspecified');
  const [mediationStepPresent, setMediationStepPresent] = useState(false);
  const [cureOfferRequired, setCureOfferRequired] = useState(false);
  const [disputeNoticeDays, setDisputeNoticeDays] = useState('');
  const [disputeVenue, setDisputeVenue] = useState('');
  const [arbitrationProcedureNotes, setArbitrationProcedureNotes] = useState('');
  const [contractFile, setContractFile] = useState<File | null>(null);

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
    setOrganizationClass('general');
    setTermsIntakeMode('none');
    setBillingErrorSupport(false);
    setDisputeResolutionPath('none');
    setArbitrationForum('unspecified');
    setMediationStepPresent(false);
    setCureOfferRequired(false);
    setDisputeNoticeDays('');
    setDisputeVenue('');
    setArbitrationProcedureNotes('');
    setContractFile(null);
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
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid rgba(251,191,36,0.28)',
                  background: 'rgba(120,53,15,0.18)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fde68a' }}>
                  Counterparty terms and billing-admin posture
                </div>
                <div style={{ color: '#fde68a', fontSize: 13 }}>
                  Capture the governing remittance, return, and billing-dispute posture now so outgoing instruments and admin notices can follow the counterparty's own rules.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <select
                    value={organizationClass}
                    onChange={(e) =>
                      setOrganizationClass(e.target.value as typeof organizationClass)
                    }
                    style={inputStyle}
                  >
                    <option value="general">General vendor</option>
                    <option value="large_bank">Large bank / financial institution</option>
                    <option value="large_corporation">Large corporation</option>
                    <option value="utility">Utility / telecom</option>
                    <option value="government">Government / agency</option>
                    <option value="servicer">Servicer / processor</option>
                  </select>
                  <select
                    value={termsIntakeMode}
                    onChange={(e) =>
                      setTermsIntakeMode(e.target.value as typeof termsIntakeMode)
                    }
                    style={inputStyle}
                  >
                    <option value="none">No contract intake yet</option>
                    <option value="auto_load">Auto-load control packet</option>
                    <option value="upload_contract">Upload counterparty terms</option>
                    <option value="manual_reference">Manual reference only</option>
                  </select>
                </div>
                {termsIntakeMode === 'upload_contract' ? (
                  <input
                    type="file"
                    onChange={(event) =>
                      setContractFile(event.target.files?.[0] || null)
                    }
                    style={inputStyle}
                  />
                ) : null}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 13,
                    color: '#fde68a',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={billingErrorSupport}
                    onChange={(event) => setBillingErrorSupport(event.target.checked)}
                  />
                  Start billing-error / escalation admin process support for this counterparty
                </label>
                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    padding: 14,
                    borderRadius: 12,
                    border: '1px solid rgba(96,165,250,0.28)',
                    background: 'rgba(30,41,59,0.4)',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#bfdbfe' }}>
                    Arbitration / mediation posture
                  </div>
                  <div style={{ color: '#bfdbfe', fontSize: 13 }}>
                    If the agreement has a dispute-resolution clause, save the path here so ClearFlow can guide notice, cure, mediation, and arbitration steps after admin process.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <select
                      value={disputeResolutionPath}
                      onChange={(e) =>
                        setDisputeResolutionPath(e.target.value as typeof disputeResolutionPath)
                      }
                      style={inputStyle}
                    >
                      <option value="none">No ADR path saved</option>
                      <option value="notice_and_cure">Notice and cure only</option>
                      <option value="notice_mediation_arbitration">Notice, mediation, then arbitration</option>
                      <option value="notice_arbitration">Notice, then arbitration</option>
                      <option value="court_litigation">Court / litigation path</option>
                    </select>
                    <select
                      value={arbitrationForum}
                      onChange={(e) =>
                        setArbitrationForum(e.target.value as typeof arbitrationForum)
                      }
                      style={inputStyle}
                    >
                      <option value="unspecified">Forum not yet captured</option>
                      <option value="aaa">AAA</option>
                      <option value="jams">JAMS</option>
                      <option value="private_forum">Private / custom forum</option>
                      <option value="court_only">Court only</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <input
                      value={disputeNoticeDays}
                      onChange={(e) => setDisputeNoticeDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      placeholder="Notice / cure days (optional)"
                      style={inputStyle}
                    />
                    <input
                      value={disputeVenue}
                      onChange={(e) => setDisputeVenue(e.target.value)}
                      placeholder="Venue / seat / governing location"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13,
                        color: '#bfdbfe',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={cureOfferRequired}
                        onChange={(event) => setCureOfferRequired(event.target.checked)}
                      />
                      Agreement requires notice and an opportunity to cure before default or escalation
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13,
                        color: '#bfdbfe',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={mediationStepPresent}
                        onChange={(event) => setMediationStepPresent(event.target.checked)}
                      />
                      Agreement calls for mediation or negotiated settlement before arbitration
                    </label>
                  </div>
                  <textarea
                    value={arbitrationProcedureNotes}
                    onChange={(e) => setArbitrationProcedureNotes(e.target.value)}
                    placeholder="Paste or summarize the dispute-resolution clause, notice language, demand path, forum rules, and filing posture here."
                    style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
                  />
                </div>
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
                organizationClass,
                termsIntakeMode,
                billingErrorSupport,
                disputeResolutionPath,
                arbitrationForum,
                mediationStepPresent,
                cureOfferRequired,
                disputeNoticeDays: disputeNoticeDays || undefined,
                disputeVenue: disputeVenue || undefined,
                arbitrationProcedureNotes: arbitrationProcedureNotes || undefined,
                contractFile,
                contractFileName: contractFile?.name,
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
