import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { WorkspaceSettingsRecord } from '../../types/core';

interface WorkspaceSettingsCardProps {
  settings: WorkspaceSettingsRecord;
  onSave: (nextSettings: WorkspaceSettingsRecord) => void;
}

const inputStyle: CSSProperties = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid rgba(255, 255, 255, 0.12)',
  background: 'rgba(10, 11, 24, 0.78)',
  color: '#fff6fd',
  padding: '10px 12px',
  fontSize: 14,
};

function formatLabel(value: string) {
  return value.replace(/_/g, ' ');
}

const booleanSettingFields: Array<{
  key:
    | 'autoIssueVerificationTokens'
    | 'autoReconcileJournalEntries'
    | 'requireDocumentLinksForSettlements'
    | 'digitalAssetVerificationRequired';
  label: string;
}> = [
  { key: 'autoIssueVerificationTokens', label: 'Auto Issue Verification Tokens' },
  { key: 'autoReconcileJournalEntries', label: 'Auto Reconcile Journal Entries' },
  {
    key: 'requireDocumentLinksForSettlements',
    label: 'Require Document Links For Settlements',
  },
  {
    key: 'digitalAssetVerificationRequired',
    label: 'Require Digital Asset Verification',
  },
];

export default function WorkspaceSettingsCard({
  settings,
  onSave,
}: WorkspaceSettingsCardProps) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  return (
    <div
      style={{
        background:
          'linear-gradient(180deg, rgba(24, 37, 67, 0.88) 0%, rgba(19, 18, 42, 0.9) 100%)',
        border: '1px solid var(--cf-border)',
        borderRadius: 18,
        padding: 18,
        display: 'grid',
        gap: 16,
        boxShadow: 'var(--cf-shadow)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{draft.workspaceName}</div>
        <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
          Stable workspace-wide defaults for onboarding, documents, settlement, and vault rules.
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
          <span>Workspace Name</span>
          <input
            style={inputStyle}
            value={draft.workspaceName}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, workspaceName: event.target.value }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Theme Mode</span>
          <select
            style={inputStyle}
            value={draft.themeMode}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                themeMode: event.target.value as WorkspaceSettingsRecord['themeMode'],
              }))
            }
          >
            {['ocean_luxe', 'midnight_gold', 'glitter_pop', 'quiet_stewardship'].map(
              (option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              )
            )}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Base Currency</span>
          <input
            style={inputStyle}
            value={draft.baseCurrency}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, baseCurrency: event.target.value || 'USD' }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Default Country</span>
          <input
            style={inputStyle}
            value={draft.defaultCountry ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, defaultCountry: event.target.value || undefined }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Default Jurisdiction</span>
          <input
            style={inputStyle}
            value={draft.defaultJurisdiction ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                defaultJurisdiction: event.target.value || undefined,
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Default Settlement Path</span>
          <select
            style={inputStyle}
            value={draft.defaultSettlementPath}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                defaultSettlementPath: event.target.value as WorkspaceSettingsRecord['defaultSettlementPath'],
              }))
            }
          >
            {[
              'ach',
              'wire',
              'internal_ledger',
              'card',
              'cash',
              'wallet',
              'tokenized_credit',
              'tokenized_debit',
              'mixed',
            ].map((option) => (
              <option key={option} value={option}>
                {formatLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Inter-Entity Mode</span>
          <select
            style={inputStyle}
            value={draft.defaultInterEntitySettlementMode}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                defaultInterEntitySettlementMode:
                  event.target.value as WorkspaceSettingsRecord['defaultInterEntitySettlementMode'],
              }))
            }
          >
            {['mirrored_halves', 'cross_entity_clearing'].map((option) => (
              <option key={option} value={option}>
                {formatLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Support Email</span>
          <input
            style={inputStyle}
            value={draft.supportEmail ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, supportEmail: event.target.value || undefined }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Accent Color</span>
          <input
            style={inputStyle}
            value={draft.preferredAccentColor ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                preferredAccentColor: event.target.value || undefined,
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Vault Retention</span>
          <select
            style={inputStyle}
            value={draft.vaultRetentionPolicy}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                vaultRetentionPolicy:
                  event.target.value as WorkspaceSettingsRecord['vaultRetentionPolicy'],
              }))
            }
          >
            {['core_records_permanent', 'seven_years', 'custom'].map((option) => (
              <option key={option} value={option}>
                {formatLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {booleanSettingFields.map(({ label, key }) => (
          <label
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              padding: '12px 14px',
            }}
          >
            <input
              type="checkbox"
              checked={draft[key]}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  [key]: event.target.checked,
                }))
              }
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {draft.vaultRetentionPolicy === 'custom' ? (
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Custom Retention Notes</span>
          <textarea
            style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }}
            value={draft.customRetentionNotes ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                customRetentionNotes: event.target.value || undefined,
              }))
            }
          />
        </label>
      ) : null}

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
          Save Workspace Settings
        </button>

        <button
          onClick={() => setDraft(settings)}
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
