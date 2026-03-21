import { useEffect, useState } from 'react';

interface RecordEditorCardProps<T> {
  title: string;
  subtitle?: string;
  record: T;
  onSave: (nextRecord: T) => void;
}

export default function RecordEditorCard<T>({
  title,
  subtitle,
  record,
  onSave,
}: RecordEditorCardProps<T>) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft(JSON.stringify(record, null, 2));
  }, [record]);

  return (
    <div
      style={{
        background:
          'linear-gradient(180deg, rgba(24, 37, 67, 0.88) 0%, rgba(19, 18, 42, 0.9) 100%)',
        border: '1px solid var(--cf-border)',
        borderRadius: 18,
        padding: 16,
        display: 'grid',
        gap: 12,
        boxShadow: 'var(--cf-shadow)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
        {subtitle ? <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>{subtitle}</div> : null}
      </div>

      {!isEditing ? (
        <>
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'rgba(10, 11, 24, 0.72)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: 12,
              color: '#f4ecf5',
              fontSize: 12,
              overflowX: 'auto',
            }}
          >
            {JSON.stringify(record, null, 2)}
          </pre>

          <div>
            <button
              onClick={() => setIsEditing(true)}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(126, 242, 255, 0.3)',
                background:
                  'linear-gradient(135deg, rgba(54, 215, 255, 0.88), rgba(88, 141, 255, 0.85))',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Edit Record
            </button>
          </div>
        </>
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{
              width: '100%',
              minHeight: 260,
              background: 'rgba(10, 11, 24, 0.78)',
              color: '#fff6fd',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 14,
              padding: 12,
              fontFamily: 'monospace',
              fontSize: 12,
            }}
          />

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                try {
                  const parsed = JSON.parse(draft) as T;
                  onSave(parsed);
                  setIsEditing(false);
                } catch {
                  alert('Invalid JSON. Fix formatting before saving.');
                }
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(126, 242, 255, 0.28)',
                background:
                  'linear-gradient(135deg, rgba(33, 194, 198, 0.9), rgba(88, 141, 255, 0.82))',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Save Changes
            </button>

            <button
              onClick={() => {
                setDraft(JSON.stringify(record, null, 2));
                setIsEditing(false);
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.04)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
