import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  EntityRecord,
  InterEntitySettlementMode,
  SettlementPath,
} from '../../types/core';

interface EntityProfileCardProps {
  entity: EntityRecord;
  onSave: (nextEntity: EntityRecord) => void;
}

const settlementOptions: SettlementPath[] = [
  'ach',
  'wire',
  'internal_ledger',
  'card',
  'cash',
  'wallet',
  'tokenized_credit',
  'tokenized_debit',
  'mixed',
];

const interEntityModeOptions: InterEntitySettlementMode[] = [
  'mirrored_halves',
  'cross_entity_clearing',
];

const entityTypeOptions: EntityRecord['type'][] = [
  'trust',
  'llc',
  'corporation',
  'partnership',
  'individual',
  'nonprofit',
  'other',
];

const entityStatusOptions: EntityRecord['status'][] = ['active', 'inactive', 'draft'];

const inputStyle: CSSProperties = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid rgba(255, 255, 255, 0.12)',
  background: 'rgba(10, 11, 24, 0.78)',
  color: '#fff6fd',
  padding: '10px 12px',
  fontSize: 14,
};

function formatModeLabel(value: string) {
  return value.replace(/_/g, ' ');
}

export default function EntityProfileCard({ entity, onSave }: EntityProfileCardProps) {
  const [draft, setDraft] = useState<EntityRecord>(entity);

  useEffect(() => {
    setDraft(entity);
  }, [entity]);

  return (
    <div
      style={{
        background:
          'linear-gradient(180deg, rgba(24, 37, 67, 0.88) 0%, rgba(19, 18, 42, 0.9) 100%)',
        border: '1px solid var(--cf-border)',
        borderRadius: 18,
        padding: 18,
        display: 'grid',
        gap: 18,
        boxShadow: 'var(--cf-shadow)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{draft.displayName || draft.name}</div>
          <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
            {draft.type} · {draft.status}
          </div>
        </div>
        <div
          style={{
            alignSelf: 'start',
            padding: '8px 12px',
            borderRadius: 999,
            border: '1px solid rgba(126, 242, 255, 0.22)',
            background: 'rgba(54, 215, 255, 0.12)',
            color: 'var(--cf-accent-soft)',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Profile Defaults
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Legal Name</span>
          <input
            style={inputStyle}
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Display Name</span>
          <input
            style={inputStyle}
            value={draft.displayName ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, displayName: event.target.value || undefined }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Entity Type</span>
          <select
            style={inputStyle}
            value={draft.type}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, type: event.target.value as EntityRecord['type'] }))
            }
          >
            {entityTypeOptions.map((option) => (
              <option key={option} value={option}>
                {formatModeLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Status</span>
          <select
            style={inputStyle}
            value={draft.status}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                status: event.target.value as EntityRecord['status'],
              }))
            }
          >
            {entityStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Jurisdiction</span>
          <input
            style={inputStyle}
            value={draft.jurisdiction ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, jurisdiction: event.target.value || undefined }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Country</span>
          <input
            style={inputStyle}
            value={draft.country ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, country: event.target.value || undefined }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Tax ID / EIN</span>
          <input
            style={inputStyle}
            value={draft.taxId ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, taxId: event.target.value || undefined }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Formation Date</span>
          <input
            type="date"
            style={inputStyle}
            value={draft.formationDate ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, formationDate: event.target.value || undefined }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Representative</span>
          <input
            style={inputStyle}
            value={draft.representativeName ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                representativeName: event.target.value || undefined,
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Representative Role</span>
          <input
            style={inputStyle}
            value={draft.representativeRole ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                representativeRole: event.target.value || undefined,
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Owner Display</span>
          <input
            style={inputStyle}
            value={draft.ownerDisplay ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, ownerDisplay: event.target.value || undefined }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Document Accent</span>
          <input
            style={inputStyle}
            value={draft.branding?.accentColor ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  accentColor: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Invoice Prefix</span>
          <input
            style={inputStyle}
            value={draft.numbering?.invoicePrefix ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                numbering: {
                  ...prev.numbering!,
                  invoicePrefix: event.target.value,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Journal Prefix</span>
          <input
            style={inputStyle}
            value={draft.numbering?.journalPrefix ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                numbering: {
                  ...prev.numbering!,
                  journalPrefix: event.target.value,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Base Currency</span>
          <input
            style={inputStyle}
            value={draft.operationalDefaults?.baseCurrency ?? 'USD'}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                operationalDefaults: {
                  ...prev.operationalDefaults!,
                  baseCurrency: event.target.value || 'USD',
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Default Settlement Path</span>
          <select
            style={inputStyle}
            value={draft.operationalDefaults?.defaultSettlementPath ?? 'ach'}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                operationalDefaults: {
                  ...prev.operationalDefaults!,
                  defaultSettlementPath: event.target.value as SettlementPath,
                },
              }))
            }
          >
            {settlementOptions.map((option) => (
              <option key={option} value={option}>
                {formatModeLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Inter-Entity Mode</span>
          <select
            style={inputStyle}
            value={draft.operationalDefaults?.interEntitySettlementMode ?? 'mirrored_halves'}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                operationalDefaults: {
                  ...prev.operationalDefaults!,
                  interEntitySettlementMode: event.target.value as InterEntitySettlementMode,
                },
              }))
            }
          >
            {interEntityModeOptions.map((option) => (
              <option key={option} value={option}>
                {formatModeLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => onSave(draft)}
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
          Save Entity Defaults
        </button>

        <button
          onClick={() => setDraft(entity)}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.04)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
