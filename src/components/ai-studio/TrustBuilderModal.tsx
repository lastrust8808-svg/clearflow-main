import { useEffect, useState, type CSSProperties } from 'react';

export interface TrustBuilderPayload {
  trustName: string;
  displayName: string;
  trustStyle:
    | 'revocable_living'
    | 'irrevocable'
    | 'land'
    | 'business'
    | 'charitable'
    | 'estate'
    | 'other';
  governingState: string;
  country: string;
  formationDate: string;
  trustEmail: string;
  storageMode: 'operator_google' | 'entity_google' | 'internal_only';
  grantorName: string;
  trusteeName: string;
  successorTrusteeName: string;
  beneficiarySummary: string;
  trustPurpose: string;
  fundingPlan: string;
  createAdministrationPacket: boolean;
  createFundingPacket: boolean;
  createTrusteePacket: boolean;
  generateDispatchIdentity: boolean;
  authorityAttested: boolean;
  governingDocFile: File | null;
}

interface TrustBuilderModalProps {
  open: boolean;
  currentUserEmail?: string;
  currentUserName?: string;
  onClose: () => void;
  onSubmit: (payload: TrustBuilderPayload) => void | Promise<void>;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2,6,23,0.76)',
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
  borderRadius: 18,
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

const labelStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 13,
  color: '#cbd5e1',
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

export default function TrustBuilderModal({
  open,
  currentUserEmail,
  currentUserName,
  onClose,
  onSubmit,
}: TrustBuilderModalProps) {
  const [trustName, setTrustName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [trustStyle, setTrustStyle] = useState<TrustBuilderPayload['trustStyle']>('revocable_living');
  const [governingState, setGoverningState] = useState('');
  const [country, setCountry] = useState('United States');
  const [formationDate, setFormationDate] = useState(new Date().toISOString().slice(0, 10));
  const [trustEmail, setTrustEmail] = useState('');
  const [storageMode, setStorageMode] = useState<
    'operator_google' | 'entity_google' | 'internal_only'
  >('operator_google');
  const [grantorName, setGrantorName] = useState('');
  const [trusteeName, setTrusteeName] = useState('');
  const [successorTrusteeName, setSuccessorTrusteeName] = useState('');
  const [beneficiarySummary, setBeneficiarySummary] = useState('');
  const [trustPurpose, setTrustPurpose] = useState('');
  const [fundingPlan, setFundingPlan] = useState('');
  const [createAdministrationPacket, setCreateAdministrationPacket] = useState(true);
  const [createFundingPacket, setCreateFundingPacket] = useState(true);
  const [createTrusteePacket, setCreateTrusteePacket] = useState(true);
  const [generateDispatchIdentity, setGenerateDispatchIdentity] = useState(true);
  const [authorityAttested, setAuthorityAttested] = useState(false);
  const [governingDocFile, setGoverningDocFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setTrustName('');
    setDisplayName('');
    setTrustStyle('revocable_living');
    setGoverningState('');
    setCountry('United States');
    setFormationDate(new Date().toISOString().slice(0, 10));
    setTrustEmail('');
    setStorageMode(currentUserEmail ? 'operator_google' : 'internal_only');
    setGrantorName(currentUserName || '');
    setTrusteeName(currentUserName || '');
    setSuccessorTrusteeName('');
    setBeneficiarySummary('');
    setTrustPurpose('');
    setFundingPlan('');
    setCreateAdministrationPacket(true);
    setCreateFundingPacket(true);
    setCreateTrusteePacket(true);
    setGenerateDispatchIdentity(true);
    setAuthorityAttested(false);
    setGoverningDocFile(null);
    setIsSubmitting(false);
  }, [currentUserEmail, currentUserName, open]);

  if (!open) {
    return null;
  }

  const entityLabel = displayName.trim() || trustName.trim() || 'this trust';
  const canSubmit =
    Boolean(trustName.trim()) &&
    Boolean(governingState.trim()) &&
    Boolean(trusteeName.trim()) &&
    authorityAttested;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        trustName,
        displayName,
        trustStyle,
        governingState,
        country,
        formationDate,
        trustEmail,
        storageMode,
        grantorName,
        trusteeName,
        successorTrusteeName,
        beneficiarySummary,
        trustPurpose,
        fundingPlan,
        createAdministrationPacket,
        createFundingPacket,
        createTrusteePacket,
        generateDispatchIdentity,
        authorityAttested,
        governingDocFile,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Trust Creator & Builder</div>
          <div style={{ color: '#94a3b8', marginTop: 6, lineHeight: 1.6 }}>
            Build the trust profile, seed authority and funding packets, and leave a clear next-step trail for
            governing records, administration, and accounting setup.
          </div>
        </div>

        <div
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.16)',
            background: 'rgba(15,23,42,0.35)',
            color: '#cbd5e1',
            lineHeight: 1.5,
            fontSize: 13,
          }}
        >
          Signed-in operator: <strong>{currentUserEmail || 'Not connected'}</strong>. This user remains attached to
          the board automatically. Add a separate trust email only if records should route under a trust-specific
          address later.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label style={labelStyle}>
            Trust legal name
            <input
              value={trustName}
              onChange={(event) => setTrustName(event.target.value)}
              placeholder="The L.A.S. Trust"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Dashboard name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Short display label"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Trust style
            <select
              value={trustStyle}
              onChange={(event) => setTrustStyle(event.target.value as TrustBuilderPayload['trustStyle'])}
              style={inputStyle}
            >
              <option value="revocable_living">Revocable living trust</option>
              <option value="irrevocable">Irrevocable trust</option>
              <option value="land">Land trust</option>
              <option value="business">Business trust</option>
              <option value="charitable">Charitable trust</option>
              <option value="estate">Estate / testamentary trust</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label style={labelStyle}>
            Governing state
            <input
              value={governingState}
              onChange={(event) => setGoverningState(event.target.value)}
              placeholder="Tennessee"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Formation date
            <input
              type="date"
              value={formationDate}
              onChange={(event) => setFormationDate(event.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Trust email / storage email
            <input
              value={trustEmail}
              onChange={(event) => setTrustEmail(event.target.value)}
              placeholder="Optional trust-specific email"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Storage routing
            <select
              value={storageMode}
              onChange={(event) =>
                setStorageMode(event.target.value as 'operator_google' | 'entity_google' | 'internal_only')
              }
              style={inputStyle}
            >
              <option value="operator_google">Operator Google Drive</option>
              <option value="entity_google">Trust Google Drive</option>
              <option value="internal_only">Internal only</option>
            </select>
          </label>
          <label style={labelStyle}>
            Country
            <input
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Grantor / settlor
            <input
              value={grantorName}
              onChange={(event) => setGrantorName(event.target.value)}
              placeholder="Grantor or settlor"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Acting trustee
            <input
              value={trusteeName}
              onChange={(event) => setTrusteeName(event.target.value)}
              placeholder="Trustee name"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Successor trustee
            <input
              value={successorTrusteeName}
              onChange={(event) => setSuccessorTrusteeName(event.target.value)}
              placeholder="Optional successor trustee"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Governing proof upload
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={(event) => setGoverningDocFile(event.target.files?.[0] || null)}
              style={inputStyle}
            />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <label style={labelStyle}>
            Beneficiary summary
            <textarea
              value={beneficiarySummary}
              onChange={(event) => setBeneficiarySummary(event.target.value)}
              placeholder="List current beneficiaries, classes, or notes"
              style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
            />
          </label>
          <label style={labelStyle}>
            Trust purpose
            <textarea
              value={trustPurpose}
              onChange={(event) => setTrustPurpose(event.target.value)}
              placeholder="Holding, estate planning, investing, property administration, operating reserve..."
              style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
            />
          </label>
          <label style={labelStyle}>
            Initial funding plan
            <textarea
              value={fundingPlan}
              onChange={(event) => setFundingPlan(event.target.value)}
              placeholder="Cash funding, titled property, assignments, metals, reserve paper, income accounts..."
              style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
            />
          </label>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 14,
            border: '1px solid rgba(148,163,184,0.16)',
            background: 'rgba(15,23,42,0.28)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>Auto-create supporting packets</div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={createTrusteePacket}
              onChange={(event) => setCreateTrusteePacket(event.target.checked)}
            />
            Create trustee authority and support packet
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={createAdministrationPacket}
              onChange={(event) => setCreateAdministrationPacket(event.target.checked)}
            />
            Create trust administration packet
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={createFundingPacket}
              onChange={(event) => setCreateFundingPacket(event.target.checked)}
            />
            Create trust funding packet
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={generateDispatchIdentity}
              onChange={(event) => setGenerateDispatchIdentity(event.target.checked)}
            />
            Generate trust seal, QR, and dispatch identity
          </label>
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#cbd5e1', lineHeight: 1.5 }}>
          <input
            type="checkbox"
            checked={authorityAttested}
            onChange={(event) => setAuthorityAttested(event.target.checked)}
            style={{ marginTop: 4 }}
          />
          <span>
            I am the acting trustee or authorized fiduciary for <strong>{entityLabel}</strong> and have legal
            authority to establish this trust profile, connect records, upload governing proof, and manage trust
            administration activity in ClearFlow.
          </span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={actionButtonStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            style={{
              ...actionButtonStyle,
              border: '1px solid rgba(126,242,255,0.28)',
              background:
                !canSubmit || isSubmitting
                  ? 'rgba(54,215,255,0.12)'
                  : 'linear-gradient(135deg, rgba(33,194,198,0.9), rgba(88,141,255,0.82))',
              color: '#fff',
              opacity: !canSubmit || isSubmitting ? 0.68 : 1,
            }}
          >
            {isSubmitting ? 'Building Trust...' : 'Create Trust Workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
