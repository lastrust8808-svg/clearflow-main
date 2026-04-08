import { useEffect, useState, type CSSProperties } from 'react';
import type { EntityType } from '../../types/core';

const REPRESENTATIVE_ROLE_PRESETS: Record<EntityType, string[]> = {
  trust: ['Trustee', 'Co-Trustee', 'Authorized fiduciary', 'Trust protector'],
  llc: ['Managing member', 'Manager', 'Authorized officer', 'Authorized signatory'],
  corporation: ['President', 'Secretary', 'Treasurer', 'Authorized officer'],
  partnership: ['General partner', 'Managing partner', 'Authorized partner', 'Authorized signatory'],
  individual: ['Owner', 'Authorized agent', 'Attorney-in-fact', 'Personal representative'],
  nonprofit: ['Executive director', 'President', 'Treasurer', 'Authorized officer'],
  other: ['Authorized representative', 'Administrator', 'Authorized officer', 'Authorized signatory'],
};

interface EntityQuickAddModalProps {
  open: boolean;
  currentUserEmail?: string;
  currentUserName?: string;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    displayName: string;
    type: EntityType;
    primaryEmail: string;
    googleStorageEmail: string;
    storageMode: 'operator_google' | 'entity_google' | 'internal_only';
    jurisdiction: string;
    country: string;
    representativeName: string;
    representativeRole: string;
    generateDispatchIdentity: boolean;
    authorityAttested: boolean;
    authorityProofFile: File | null;
  }) => void | Promise<void>;
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
  width: 'min(720px, 100%)',
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

export default function EntityQuickAddModal({
  open,
  currentUserEmail,
  currentUserName,
  onClose,
  onSubmit,
}: EntityQuickAddModalProps) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [type, setType] = useState<EntityType>('llc');
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [googleStorageEmail, setGoogleStorageEmail] = useState('');
  const [storageMode, setStorageMode] = useState<
    'operator_google' | 'entity_google' | 'internal_only'
  >('operator_google');
  const [jurisdiction, setJurisdiction] = useState('');
  const [country, setCountry] = useState('United States');
  const [representativeName, setRepresentativeName] = useState('');
  const [representativeRole, setRepresentativeRole] = useState('');
  const [generateDispatchIdentity, setGenerateDispatchIdentity] = useState(true);
  const [authorityAttested, setAuthorityAttested] = useState(false);
  const [authorityProofFile, setAuthorityProofFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDisplayName('');
    setType('llc');
    setPrimaryEmail('');
    setGoogleStorageEmail(currentUserEmail || '');
    setStorageMode(currentUserEmail ? 'operator_google' : 'internal_only');
    setJurisdiction('');
    setCountry('United States');
    setRepresentativeName('');
    setRepresentativeRole('');
    setGenerateDispatchIdentity(true);
    setAuthorityAttested(false);
    setAuthorityProofFile(null);
    setIsSubmitting(false);
  }, [currentUserEmail, open]);

  if (!open) return null;

  const trimmedName = name.trim();
  const trimmedDisplayName = displayName.trim();
  const trimmedRepresentativeName = representativeName.trim();
  const trimmedRepresentativeRole = representativeRole.trim();
  const entityLabel = trimmedDisplayName || trimmedName || 'this entity';
  const rolePresets = REPRESENTATIVE_ROLE_PRESETS[type];
  const authorityStatement = `I am ${trimmedRepresentativeRole || 'an authorized representative'} of ${entityLabel} and have the legal authority to establish, administer, connect, and operate this entity in ClearFlow, including authorizing records, integrations, and retained platform history for that entity.`;
  const canSubmit =
    Boolean(trimmedName) &&
    Boolean(trimmedRepresentativeName) &&
    Boolean(trimmedRepresentativeRole) &&
    authorityAttested &&
    Boolean(authorityProofFile);

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        displayName,
        type,
        primaryEmail,
        googleStorageEmail,
        storageMode,
        jurisdiction,
        country,
        representativeName,
        representativeRole,
        generateDispatchIdentity,
        authorityAttested,
        authorityProofFile,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Add Entity</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Stand up a new entity profile with branding, numbering, and operating defaults ready to edit.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Legal name" style={inputStyle} />
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" style={inputStyle} />
          <select value={type} onChange={(e) => setType(e.target.value as EntityType)} style={inputStyle}>
            <option value="trust">Trust</option>
            <option value="llc">LLC</option>
            <option value="corporation">Corporation</option>
            <option value="partnership">Partnership</option>
            <option value="nonprofit">Nonprofit</option>
            <option value="individual">Individual</option>
            <option value="other">Other</option>
          </select>
          <input value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} placeholder="Entity email" style={inputStyle} />
          <input value={googleStorageEmail} onChange={(e) => setGoogleStorageEmail(e.target.value)} placeholder="Google storage email" style={inputStyle} />
          <select value={storageMode} onChange={(e) => setStorageMode(e.target.value as 'operator_google' | 'entity_google' | 'internal_only')} style={inputStyle}>
            <option value="operator_google">Operator Google Drive</option>
            <option value="entity_google">Entity Google Drive</option>
            <option value="internal_only">Internal only</option>
          </select>
          <input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="Jurisdiction" style={inputStyle} />
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" style={inputStyle} />
          <input value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} placeholder="Representative name" style={inputStyle} />
          <input value={representativeRole} onChange={(e) => setRepresentativeRole(e.target.value)} placeholder="Representative role" style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>
            Suggested representative capacities for this entity type
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {rolePresets.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRepresentativeRole(role)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border:
                    trimmedRepresentativeRole === role
                      ? '1px solid rgba(126,242,255,0.34)'
                      : '1px solid rgba(148,163,184,0.22)',
                  background:
                    trimmedRepresentativeRole === role
                      ? 'rgba(54,215,255,0.12)'
                      : 'rgba(15,23,42,0.46)',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#cbd5e1' }}>
          <input
            type="checkbox"
            checked={generateDispatchIdentity}
            onChange={(event) => setGenerateDispatchIdentity(event.target.checked)}
          />
          Generate entity mailing line and proof QR for outgoing records
        </label>
        <div
          style={{
            borderRadius: 14,
            border: '1px solid rgba(248,250,252,0.12)',
            background: 'rgba(15,23,42,0.55)',
            padding: 14,
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700 }}>Authority Attestation</div>
          <div style={{ color: '#cbd5e1', lineHeight: 1.65 }}>
            ClearFlow relies on the user adding an entity to represent that they are the lawful
            owner, officer, manager, trustee, administrator, fiduciary, or otherwise authorized
            representative for that entity. Do not add an entity you are not authorized to operate.
          </div>
          <div style={{ color: '#94a3b8', lineHeight: 1.6, fontSize: 13 }}>
            Recommended for {type === 'trust' ? 'trust' : type === 'individual' ? 'personal' : 'business'} records:
            {' '}
            {rolePresets.join(', ')}.
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#e2e8f0', lineHeight: 1.6 }}>
            <input
              type="checkbox"
              checked={authorityAttested}
              onChange={(event) => setAuthorityAttested(event.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span>{authorityStatement}</span>
          </label>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6 }}>
              Upload a certificate of trust, certificate of existence, or similar authority proof. ClearFlow will compare named parties against {currentUserName || 'the signed-in operator'} and hold transaction release if the names do not line up or additional members/signers need to be added.
            </div>
            <input
              type="file"
              onChange={(event) => setAuthorityProofFile(event.target.files?.[0] || null)}
              style={inputStyle}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
            />
            <div style={{ color: authorityProofFile ? '#cbd5e1' : '#94a3b8', fontSize: 12 }}>
              {authorityProofFile
                ? `Authority proof selected: ${authorityProofFile.name}`
                : 'Authority proof is required before creating the entity.'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>Cancel</button>
          <button
            type="button"
            disabled={!canSubmit || isSubmitting}
            onClick={handleSubmit}
            style={{
              ...buttonStyle,
              background: canSubmit && !isSubmitting
                ? 'linear-gradient(135deg, rgba(33,194,198,0.9), rgba(88,141,255,0.82))'
                : 'rgba(71,85,105,0.6)',
              borderColor: canSubmit && !isSubmitting ? 'rgba(126,242,255,0.28)' : 'rgba(148,163,184,0.2)',
              cursor: canSubmit && !isSubmitting ? 'pointer' : 'not-allowed',
              opacity: canSubmit && !isSubmitting ? 1 : 0.75,
            }}
          >
            {isSubmitting ? 'Creating Entity...' : 'Create Entity'}
          </button>
        </div>
      </div>
    </div>
  );
}
