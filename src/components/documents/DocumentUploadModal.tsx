import { useEffect, useState, type CSSProperties } from 'react';
import type { DocumentCategory, EntityRecord } from '../../types/core';

interface DocumentUploadModalProps {
  open: boolean;
  entities: EntityRecord[];
  onClose: () => void;
  onSubmit: (payload: {
    entityId: string;
    title: string;
    category: DocumentCategory;
    date: string;
    summary: string;
    file: File | null;
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

export default function DocumentUploadModal({ open, entities, onClose, onSubmit }: DocumentUploadModalProps) {
  const [entityId, setEntityId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('financial');
  const [date, setDate] = useState('');
  const [summary, setSummary] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setEntityId(entities[0]?.id || '');
    setTitle('');
    setCategory('financial');
    setDate(new Date().toISOString().slice(0, 10));
    setSummary('');
    setFile(null);
  }, [entities, open]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Upload Document</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Retain a source file in the vault and link it into the entity record flow.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={inputStyle}>
            <option value="">Select entity</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.displayName || entity.name}
              </option>
            ))}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" style={inputStyle} />
          <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)} style={inputStyle}>
            <option value="financial">Financial</option>
            <option value="governing">Governing</option>
            <option value="compliance">Compliance</option>
            <option value="contract">Contract</option>
            <option value="tax">Tax</option>
            <option value="authority_record">Authority</option>
            <option value="other">Other</option>
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={inputStyle} />
        </div>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What this document is for" style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>Cancel</button>
          <button
            type="button"
            onClick={() => onSubmit({ entityId, title, category, date, summary, file })}
            style={{ ...buttonStyle, background: 'linear-gradient(135deg, rgba(33,194,198,0.9), rgba(88,141,255,0.82))', borderColor: 'rgba(126,242,255,0.28)' }}
          >
            Save Document
          </button>
        </div>
      </div>
    </div>
  );
}
