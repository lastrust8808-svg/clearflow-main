import { useEffect, useState, type ReactNode } from 'react';

export interface WorkbenchSummaryItem {
  label: string;
  value: ReactNode;
}

interface WorkbenchRecordCardProps<T> {
  key?: string | number;
  title: string;
  subtitle?: string;
  summaryItems?: WorkbenchSummaryItem[];
  record?: T;
  onSave?: (nextRecord: T) => void;
  children?: ReactNode;
  actionSlot?: ReactNode;
  emptyState?: string;
}

export default function WorkbenchRecordCard<T>({
  title,
  subtitle,
  summaryItems = [],
  record,
  onSave,
  children,
  actionSlot,
  emptyState = 'No additional details available.',
}: WorkbenchRecordCardProps<T>) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (record !== undefined) {
      setDraft(JSON.stringify(record, null, 2));
    }
  }, [record]);

  return (
    <div
      style={{
        background:
          'linear-gradient(180deg, rgba(25, 40, 72, 0.9) 0%, rgba(18, 19, 42, 0.92) 100%)',
        border: '1px solid var(--cf-border)',
        borderRadius: 18,
        padding: 16,
        boxShadow: 'var(--cf-shadow)',
        backdropFilter: 'blur(18px)',
        display: 'grid',
        gap: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
          {subtitle ? (
            <div style={{ color: 'var(--cf-muted)', marginTop: 6, lineHeight: 1.55 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {actionSlot ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actionSlot}</div> : null}
      </div>

      {summaryItems.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
          }}
        >
          {summaryItems.map((item) => (
            <div
              key={item.label}
              style={{
                borderRadius: 14,
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--cf-accent-soft)',
                  textTransform: 'uppercase',
                  letterSpacing: 1.1,
                  marginBottom: 6,
                }}
              >
                {item.label}
              </div>
              <div style={{ color: 'var(--cf-text)', fontWeight: 700, lineHeight: 1.5 }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {children ? (
        <div style={{ color: 'var(--cf-muted)', lineHeight: 1.65 }}>{children}</div>
      ) : !summaryItems.length ? (
        <div style={{ color: 'var(--cf-muted)', lineHeight: 1.65 }}>{emptyState}</div>
      ) : null}

      {record !== undefined && onSave ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {!isEditing ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(126, 242, 255, 0.28)',
                  background: 'rgba(54, 215, 255, 0.09)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Advanced Edit
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                style={{
                  width: '100%',
                  minHeight: 220,
                  background: 'rgba(10, 11, 24, 0.78)',
                  color: '#fff6fd',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 14,
                  padding: 12,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  boxSizing: 'border-box',
                }}
              />

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
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
                  type="button"
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
      ) : null}
    </div>
  );
}
