import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  BankAccountRecord,
  CoreDataBundle,
  LedgerAccountRecord,
  TreasuryAccountRecord,
  WorkspaceSettingsRecord,
} from '../../types/core';

interface WorkspaceSettingsCardProps {
  settings: WorkspaceSettingsRecord;
  entities: CoreDataBundle['entities'];
  treasuryAccounts: TreasuryAccountRecord[];
  bankAccounts: BankAccountRecord[];
  ledgerAccounts: LedgerAccountRecord[];
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

function includesAny(value: string | undefined, patterns: string[]) {
  const haystack = (value || '').toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern));
}

const booleanSettingFields: Array<{
  key:
    | 'autoIssueVerificationTokens'
    | 'autoReconcileJournalEntries'
    | 'requireDocumentLinksForSettlements'
    | 'digitalAssetVerificationRequired'
    | 'autoRouteUserOwnedDocumentsToDrive'
    | 'eftpsEnabled'
    | 'uspsGatewayEnabled';
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
  {
    key: 'autoRouteUserOwnedDocumentsToDrive',
    label: 'Auto Route User-Owned Documents To Google Drive',
  },
  { key: 'eftpsEnabled', label: 'Enable EFTPS Integration Profile' },
  { key: 'uspsGatewayEnabled', label: 'Enable USPS Gateway Integration Profile' },
];

export default function WorkspaceSettingsCard({
  settings,
  entities,
  treasuryAccounts,
  bankAccounts,
  ledgerAccounts,
  onSave,
}: WorkspaceSettingsCardProps) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const getEntityLabel = (entityId?: string) =>
    entities.find((item) => item.id === entityId)?.displayName ||
    entities.find((item) => item.id === entityId)?.name ||
    entityId ||
    'Unknown entity';

  const suggestedEftpsTreasury =
    treasuryAccounts.find(
      (account) =>
        account.treasuryType === 'operational_cash' ||
        account.treasuryType === 'remittance_clearing',
    ) || treasuryAccounts.find((account) => account.treasuryType === 'reserve');

  const suggestedEftpsBank =
    bankAccounts.find((account) => account.achOriginationEnabled && account.status === 'active') ||
    bankAccounts.find((account) => account.status === 'active');

  const suggestedEftpsLedger =
    ledgerAccounts.find((account) =>
      includesAny(account.name, ['tax', 'withholding', 'payroll']),
    ) || ledgerAccounts.find((account) => includesAny(account.name, ['cash', 'operating']));

  const suggestedUspsBank =
    bankAccounts.find((account) =>
      includesAny(account.accountName, ['operating', 'trust operating']),
    ) || bankAccounts.find((account) => account.status === 'active');

  const suggestedUspsPostageLedger =
    ledgerAccounts.find((account) =>
      includesAny(account.name, ['postage', 'shipping', 'mail', 'delivery']),
    ) || ledgerAccounts.find((account) => account.accountType === 'expense');

  const suggestedUspsEvidenceLedger =
    ledgerAccounts.find((account) =>
      includesAny(account.name, ['evidence', 'records', 'clearing', 'receivable']),
    ) || ledgerAccounts.find((account) => account.accountType === 'memo');

  const applySuggestedEftpsMapping = () =>
    setDraft((prev) => ({
      ...prev,
      eftpsLinkedTreasuryAccountId:
        prev.eftpsLinkedTreasuryAccountId || suggestedEftpsTreasury?.id || undefined,
      eftpsLinkedBankAccountId:
        prev.eftpsLinkedBankAccountId || suggestedEftpsBank?.id || undefined,
      eftpsTaxLedgerAccountId:
        prev.eftpsTaxLedgerAccountId || suggestedEftpsLedger?.id || undefined,
    }));

  const applySuggestedUspsMapping = () =>
    setDraft((prev) => ({
      ...prev,
      uspsLinkedBankAccountId:
        prev.uspsLinkedBankAccountId || suggestedUspsBank?.id || undefined,
      uspsPostageLedgerAccountId:
        prev.uspsPostageLedgerAccountId || suggestedUspsPostageLedger?.id || undefined,
      uspsEvidenceLedgerAccountId:
        prev.uspsEvidenceLedgerAccountId || suggestedUspsEvidenceLedger?.id || undefined,
    }));

  return (
    <div
      style={{
        background: 'var(--cf-panel-strong)',
        border: '1px solid var(--cf-border)',
        borderRadius: 18,
        padding: 18,
        display: 'grid',
        gap: 16,
        boxShadow: 'var(--cf-shadow)',
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

      <div
        style={{
          display: 'grid',
          gap: 12,
          padding: 16,
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700 }}>Treasury Tax Payment Profile</div>
        <div style={{ color: 'var(--cf-muted)', lineHeight: 1.6 }}>
          Suggested mapping: treasury {suggestedEftpsTreasury?.name || 'none found'} | bank{' '}
          {suggestedEftpsBank?.accountName || 'none found'} | ledger{' '}
          {suggestedEftpsLedger
            ? `${suggestedEftpsLedger.code} ${suggestedEftpsLedger.name}`
            : 'none found'}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>EFTPS Enrollment Status</span>
            <select
              style={inputStyle}
              value={draft.eftpsEnrollmentStatus ?? 'not_started'}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  eftpsEnrollmentStatus:
                    event.target.value as WorkspaceSettingsRecord['eftpsEnrollmentStatus'],
                }))
              }
            >
              {['not_started', 'pending_pin', 'active', 'restricted'].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>EFTPS EIN</span>
            <input
              style={inputStyle}
              value={draft.eftpsEin ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, eftpsEin: event.target.value || undefined }))
              }
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>EFTPS Operator</span>
            <input
              style={inputStyle}
              value={draft.eftpsOperatorName ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  eftpsOperatorName: event.target.value || undefined,
                }))
              }
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Deposit Mode</span>
            <select
              style={inputStyle}
              value={draft.eftpsDepositMode ?? 'manual_site'}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  eftpsDepositMode:
                    event.target.value as WorkspaceSettingsRecord['eftpsDepositMode'],
                }))
              }
            >
              {['manual_site', 'ach_credit', 'mixed'].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Last EFTPS Evidence Date</span>
            <input
              type="date"
              style={inputStyle}
              value={draft.eftpsLastEvidenceDate ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  eftpsLastEvidenceDate: event.target.value || undefined,
                }))
              }
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Linked Treasury Account</span>
            <select
              style={inputStyle}
              value={draft.eftpsLinkedTreasuryAccountId ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  eftpsLinkedTreasuryAccountId: event.target.value || undefined,
                }))
              }
            >
              <option value="">Not linked</option>
              {treasuryAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({getEntityLabel(account.entityId)})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Linked Bank Account</span>
            <select
              style={inputStyle}
              value={draft.eftpsLinkedBankAccountId ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  eftpsLinkedBankAccountId: event.target.value || undefined,
                }))
              }
            >
              <option value="">Not linked</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountName} ({getEntityLabel(account.entityId)})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Tax Ledger Account</span>
            <select
              style={inputStyle}
              value={draft.eftpsTaxLedgerAccountId ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  eftpsTaxLedgerAccountId: event.target.value || undefined,
                }))
              }
            >
              <option value="">Not linked</option>
              {ledgerAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} {account.name} ({getEntityLabel(account.entityId)})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={applySuggestedEftpsMapping}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(126, 242, 255, 0.28)',
              background: 'rgba(54, 215, 255, 0.08)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Apply Suggested EFTPS Mapping
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 12,
          padding: 16,
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700 }}>Postal Operations Profile</div>
        <div style={{ color: 'var(--cf-muted)', lineHeight: 1.6 }}>
          Suggested mapping: bank {suggestedUspsBank?.accountName || 'none found'} | postage ledger{' '}
          {suggestedUspsPostageLedger
            ? `${suggestedUspsPostageLedger.code} ${suggestedUspsPostageLedger.name}`
            : 'none found'}{' '}
          | evidence ledger{' '}
          {suggestedUspsEvidenceLedger
            ? `${suggestedUspsEvidenceLedger.code} ${suggestedUspsEvidenceLedger.name}`
            : 'none found'}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>USPS Gateway Status</span>
            <select
              style={inputStyle}
              value={draft.uspsGatewayStatus ?? 'not_started'}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  uspsGatewayStatus:
                    event.target.value as WorkspaceSettingsRecord['uspsGatewayStatus'],
                }))
              }
            >
              {['not_started', 'setup_in_progress', 'active', 'restricted'].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>CRID</span>
            <input
              style={inputStyle}
              value={draft.uspsCrid ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, uspsCrid: event.target.value || undefined }))
              }
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Mailer ID</span>
            <input
              style={inputStyle}
              value={draft.uspsMailerId ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, uspsMailerId: event.target.value || undefined }))
              }
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Permit Number</span>
            <input
              style={inputStyle}
              value={draft.uspsPermitNumber ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  uspsPermitNumber: event.target.value || undefined,
                }))
              }
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Service Profile</span>
            <select
              style={inputStyle}
              value={draft.uspsServiceProfile ?? 'mailing_only'}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  uspsServiceProfile:
                    event.target.value as WorkspaceSettingsRecord['uspsServiceProfile'],
                }))
              }
            >
              {['mailing_only', 'postalone', 'evs', 'pdx', 'mixed'].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Business Service Administrator</span>
            <input
              style={inputStyle}
              value={draft.uspsBusinessServiceAdmin ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  uspsBusinessServiceAdmin: event.target.value || undefined,
                }))
              }
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Linked Bank Account</span>
            <select
              style={inputStyle}
              value={draft.uspsLinkedBankAccountId ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  uspsLinkedBankAccountId: event.target.value || undefined,
                }))
              }
            >
              <option value="">Not linked</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountName} ({getEntityLabel(account.entityId)})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Postage Ledger Account</span>
            <select
              style={inputStyle}
              value={draft.uspsPostageLedgerAccountId ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  uspsPostageLedgerAccountId: event.target.value || undefined,
                }))
              }
            >
              <option value="">Not linked</option>
              {ledgerAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} {account.name} ({getEntityLabel(account.entityId)})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Evidence Ledger Account</span>
            <select
              style={inputStyle}
              value={draft.uspsEvidenceLedgerAccountId ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  uspsEvidenceLedgerAccountId: event.target.value || undefined,
                }))
              }
            >
              <option value="">Not linked</option>
              {ledgerAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} {account.name} ({getEntityLabel(account.entityId)})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={applySuggestedUspsMapping}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(126, 242, 255, 0.28)',
              background: 'rgba(54, 215, 255, 0.08)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Apply Suggested USPS Mapping
          </button>
        </div>
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
          Save Workspace Settings
        </button>

        <button
          type="button"
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
