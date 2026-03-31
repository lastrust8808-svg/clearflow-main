import { useEffect, useState, type CSSProperties } from 'react';
import type { EntityType } from '../../types/core';

interface EntityQuickAddModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    displayName: string;
    type: EntityType;
    jurisdiction: string;
    country: string;
    representativeName: string;
    representativeRole: string;
    generateDispatchIdentity: boolean;
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

export default function EntityQuickAddModal({ open, onClose, onSubmit }: EntityQuickAddModalProps) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [type, setType] = useState<EntityType>('llc');
  const [jurisdiction, setJurisdiction] = useState('');
  const [country, setCountry] = useState('United States');
  const [representativeName, setRepresentativeName] = useState('');
  const [representativeRole, setRepresentativeRole] = useState('');
  const [generateDispatchIdentity, setGenerateDispatchIdentity] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDisplayName('');
    setType('llc');
    setJurisdiction('');
    setCountry('United States');
    setRepresentativeName('');
    setRepresentativeRole('');
    setGenerateDispatchIdentity(true);
  }, [open]);

  if (!open) return null;

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
          <input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="Jurisdiction" style={inputStyle} />
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" style={inputStyle} />
          <input value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} placeholder="Representative name" style={inputStyle} />
          <input value={representativeRole} onChange={(e) => setRepresentativeRole(e.target.value)} placeholder="Representative role" style={inputStyle} />
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#cbd5e1' }}>
          <input
            type="checkbox"
            checked={generateDispatchIdentity}
            onChange={(event) => setGenerateDispatchIdentity(event.target.checked)}
          />
          Generate entity mailing line and proof QR for outgoing records
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>Cancel</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                name,
                displayName,
                type,
                jurisdiction,
                country,
                representativeName,
                representativeRole,
                generateDispatchIdentity,
              })
            }
            style={{ ...buttonStyle, background: 'linear-gradient(135deg, rgba(33,194,198,0.9), rgba(88,141,255,0.82))', borderColor: 'rgba(126,242,255,0.28)' }}
          >
            Create Entity
          </button>
        </div>
      </div>
    </div>
  );
}
