import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  EntityRecord,
  InterEntitySettlementMode,
  SettlementPath,
} from '../../types/core';
import { buildEntitySealDesign } from '../../services/dispatchIdentity.service';

const sealTemplateOptions: NonNullable<EntityRecord['branding']>['sealTemplate'][] = [
  'round',
  'oval',
  'notary',
  'minimal',
];

interface EntityProfileCardProps {
  entity: EntityRecord;
  currentGoogleEmail?: string;
  isActive?: boolean;
  onSetActive?: () => void;
  defaultCurrency?: string;
  sealValueSummary?: {
    usageCount: number;
    reserveValue: number;
    unitsIssued: number;
    treasuryLabel?: string;
    digitalAssetLabel?: string;
    currency: string;
  };
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

function previewFrameStyle(): CSSProperties {
  return {
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(255,255,255,0.03)',
    padding: 10,
    minHeight: 88,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

export default function EntityProfileCard({
  entity,
  currentGoogleEmail,
  isActive = false,
  onSetActive,
  defaultCurrency,
  sealValueSummary,
  onSave,
}: EntityProfileCardProps) {
  const [draft, setDraft] = useState<EntityRecord>(entity);

  useEffect(() => {
    setDraft(entity);
  }, [entity]);

  const liveSealSvg = buildEntitySealDesign({
    entityName: draft.displayName || draft.name,
    jurisdiction: draft.jurisdiction || draft.country,
    template: draft.branding?.sealTemplate,
    primaryText: draft.branding?.sealPrimaryText || draft.displayName || draft.name,
    secondaryText:
      draft.branding?.sealSecondaryText ||
      draft.jurisdiction ||
      draft.country ||
      'ClearFlow Entity Seal',
    inkColor:
      draft.branding?.sealInkColor ||
      draft.branding?.accentColor ||
      '#36d7ff',
  });
  const storageMode = draft.entityAccess?.storageMode ?? 'operator_google';
  const storageEmail = draft.entityAccess?.googleStorageEmail || draft.primaryEmail || '';
  const currentEmail = (currentGoogleEmail || '').trim().toLowerCase();
  const targetEmail = storageEmail.trim().toLowerCase();
  const storageStatus =
    storageMode === 'internal_only'
      ? 'Internal only'
      : !storageEmail
        ? 'Google storage email needed'
        : currentEmail && currentEmail === targetEmail
          ? 'Connected to current Google session'
          : 'Needs Google account switch for entity storage';

  return (
    <div
      style={{
        background: 'var(--cf-panel-strong)',
        border: '1px solid var(--cf-border)',
        borderRadius: 18,
        padding: 18,
        display: 'grid',
        gap: 18,
        boxShadow: 'var(--cf-shadow)',
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

      {onSetActive ? (
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            type="button"
            onClick={onSetActive}
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              border: '1px solid rgba(126, 242, 255, 0.22)',
              background: isActive ? 'rgba(54, 215, 255, 0.16)' : 'rgba(255,255,255,0.04)',
              color: isActive ? 'var(--cf-accent-soft)' : 'var(--cf-text)',
              fontSize: 12,
              letterSpacing: 1,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {isActive ? 'Active Board' : 'Set Active Board'}
          </button>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Primary Entity Email</span>
          <input
            style={inputStyle}
            type="email"
            value={draft.primaryEmail ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, primaryEmail: event.target.value || undefined }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Google Storage Email</span>
          <input
            style={inputStyle}
            type="email"
            value={draft.entityAccess?.googleStorageEmail ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                entityAccess: {
                  ...prev.entityAccess,
                  googleStorageEmail: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Entity Storage Mode</span>
          <select
            style={inputStyle}
            value={storageMode}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                entityAccess: {
                  ...prev.entityAccess,
                  storageMode: event.target.value as NonNullable<EntityRecord['entityAccess']>['storageMode'],
                },
              }))
            }
          >
            <option value="operator_google">Operator Google Drive</option>
            <option value="entity_google">Entity Google Drive</option>
            <option value="internal_only">Internal only</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Share In Collective Overview</span>
          <select
            style={inputStyle}
            value={draft.entityAccess?.shareInCollectiveOverview === false ? 'no' : 'yes'}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                entityAccess: {
                  ...prev.entityAccess,
                  shareInCollectiveOverview: event.target.value === 'yes',
                },
              }))
            }
          >
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Share In Operator Dashboard</span>
          <select
            style={inputStyle}
            value={draft.entityAccess?.shareInOperatorDashboard === false ? 'no' : 'yes'}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                entityAccess: {
                  ...prev.entityAccess,
                  shareInOperatorDashboard: event.target.value === 'yes',
                },
              }))
            }
          >
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Storage Notes</span>
          <input
            style={inputStyle}
            value={draft.entityAccess?.notes ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                entityAccess: {
                  ...prev.entityAccess,
                  notes: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
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
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Seal Template</span>
          <select
            style={inputStyle}
            value={draft.branding?.sealTemplate ?? 'round'}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  sealTemplate: event.target.value as NonNullable<EntityRecord['branding']>['sealTemplate'],
                },
              }))
            }
          >
            {sealTemplateOptions.map((option) => (
              <option key={option} value={option}>
                {formatModeLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Seal Primary Text</span>
          <input
            style={inputStyle}
            value={draft.branding?.sealPrimaryText ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  sealPrimaryText: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Seal Secondary Text</span>
          <input
            style={inputStyle}
            value={draft.branding?.sealSecondaryText ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  sealSecondaryText: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Seal Ink Color</span>
          <input
            style={inputStyle}
            value={draft.branding?.sealInkColor ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  sealInkColor: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Seal Value Reserve Enabled</span>
          <select
            style={inputStyle}
            value={draft.branding?.sealValueEnabled ? 'yes' : 'no'}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  sealValueEnabled: event.target.value === 'yes',
                },
              }))
            }
          >
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Seal Unit Value</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            style={inputStyle}
            value={draft.branding?.sealUnitValue ?? 1}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  sealUnitValue: Number(event.target.value || 1),
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Seal Value Currency</span>
          <input
            style={inputStyle}
            value={draft.branding?.sealValueCurrency ?? defaultCurrency ?? 'USD'}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  sealValueCurrency: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Email From Name</span>
          <input
            style={inputStyle}
            value={draft.branding?.emailFromName ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  emailFromName: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Reply-To Email</span>
          <input
            style={inputStyle}
            type="email"
            value={draft.branding?.replyToEmail ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  replyToEmail: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Document Logo Text</span>
          <input
            style={inputStyle}
            value={draft.branding?.documentLogoText ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  documentLogoText: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Invoice Footer Note</span>
          <input
            style={inputStyle}
            value={draft.branding?.invoiceFooterNote ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  invoiceFooterNote: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Auto Dispatch Identity</span>
          <select
            style={inputStyle}
            value={draft.branding?.autoGenerateDispatchIdentity ? 'yes' : 'no'}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  autoGenerateDispatchIdentity: event.target.value === 'yes',
                },
              }))
            }
          >
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Entity Mailing Line</span>
          <input
            style={inputStyle}
            value={draft.branding?.entityMailingLine ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  entityMailingLine: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Proof Seal Code</span>
          <input
            style={inputStyle}
            value={draft.branding?.entityProofSealCode ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  entityProofSealCode: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>QR Payload</span>
          <input
            style={inputStyle}
            value={draft.branding?.entityQrPayload ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                branding: {
                  ...prev.branding,
                  entityQrPayload: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
      </div>

      <div
        style={{
          borderRadius: 14,
          border: '1px solid rgba(126, 242, 255, 0.16)',
          background: 'rgba(54, 215, 255, 0.06)',
          padding: 14,
          color: '#d1d5db',
          lineHeight: 1.65,
        }}
      >
        <strong style={{ display: 'block', marginBottom: 8 }}>Entity Storage Routing</strong>
        <div>Current Google session: {currentGoogleEmail || 'Not connected'}</div>
        <div>Storage target: {storageEmail || 'Not set'}</div>
        <div>Mode: {storageMode.replace(/_/g, ' ')}</div>
        <div>Status: {storageStatus}</div>
      </div>

      {(draft.branding?.entityQrSealSvg || draft.branding?.entityMailingBarcodeSvg) ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <span>Proof QR / Seal</span>
            <div
              style={previewFrameStyle()}
              dangerouslySetInnerHTML={{ __html: draft.branding?.entityQrSealSvg || '' }}
            />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <span>Mailing Barcode</span>
            <div
              style={previewFrameStyle()}
              dangerouslySetInnerHTML={{ __html: draft.branding?.entityMailingBarcodeSvg || '' }}
            />
          </div>
        </div>
      ) : null}

      {liveSealSvg ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <span>Entity Stamp / Seal Design Space</span>
          <div style={{ ...previewFrameStyle(), minHeight: 220 }}>
            <div
              style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
              dangerouslySetInnerHTML={{ __html: liveSealSvg }}
            />
          </div>
        </div>
      ) : null}

      {sealValueSummary ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          <div style={previewFrameStyle()}>
            <div style={{ display: 'grid', gap: 4, textAlign: 'center' }}>
              <strong>Mark Usage Events</strong>
              <span>{sealValueSummary.usageCount}</span>
            </div>
          </div>
          <div style={previewFrameStyle()}>
            <div style={{ display: 'grid', gap: 4, textAlign: 'center' }}>
              <strong>Reserve Value</strong>
              <span>
                {sealValueSummary.currency} {sealValueSummary.reserveValue.toLocaleString()}
              </span>
            </div>
          </div>
          <div style={previewFrameStyle()}>
            <div style={{ display: 'grid', gap: 4, textAlign: 'center' }}>
              <strong>Units Issued</strong>
              <span>{sealValueSummary.unitsIssued}</span>
            </div>
          </div>
          <div style={previewFrameStyle()}>
            <div style={{ display: 'grid', gap: 4, textAlign: 'center' }}>
              <strong>Reserve Links</strong>
              <span>{sealValueSummary.treasuryLabel || 'Treasury auto-routes when used'}</span>
              <span>{sealValueSummary.digitalAssetLabel || 'Digital asset auto-issues when used'}</span>
            </div>
          </div>
        </div>
      ) : null}

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
          type="button"
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
          type="button"
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
