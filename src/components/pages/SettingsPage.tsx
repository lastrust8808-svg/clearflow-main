import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import { useAuth } from '../../hooks/useAuth';
import {
  loadIntegrationStatus,
  type IntegrationStatusSnapshot,
} from '../../services/integrationStatus.service';
import WorkspaceSettingsCard from '../settings/WorkspaceSettingsCard';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface SettingsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function SettingsPage({ data, setData }: SettingsPageProps) {
  const auth = useAuth();
  const [backupUserId, setBackupUserId] = useState(auth.currentUser?.userHandle ?? '');
  const [backupPassword, setBackupPassword] = useState('');
  const [preferredContactType, setPreferredContactType] = useState<'email' | 'phone'>(
    auth.currentUser?.phone && !auth.currentUser?.email ? 'phone' : 'email'
  );
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [isSavingBackup, setIsSavingBackup] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusSnapshot | null>(null);
  const [integrationLoading, setIntegrationLoading] = useState(true);

  useEffect(() => {
    void loadIntegrationStatus()
      .then((status) => setIntegrationStatus(status))
      .finally(() => setIntegrationLoading(false));
  }, []);

  const handleSaveBackupAccess = async () => {
    setBackupError(null);
    setBackupNotice(null);
    setIsSavingBackup(true);

    try {
      const result = await auth.updateBackupAccess({
        userHandle: backupUserId || undefined,
        password: backupPassword || undefined,
        preferredContactType,
      });

      if (!result.success) {
        setBackupError(result.error || 'Backup access could not be updated.');
        return;
      }

      setBackupNotice('Backup access settings saved.');
      setBackupPassword('');
    } finally {
      setIsSavingBackup(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Settings</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Workspace-wide defaults for identity, settlement, vault discipline, verification, and access posture.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Theme Mode" value={data.workspaceSettings.themeMode.replace(/_/g, ' ')} />
        <StatCard label="Base Currency" value={data.workspaceSettings.baseCurrency} />
        <StatCard
          label="Settlement Default"
          value={data.workspaceSettings.defaultSettlementPath.replace(/_/g, ' ')}
        />
        <StatCard
          label="Sign-In Priority"
          value={auth.isConfigured ? 'Google first' : 'Backup sign-in'}
        />
      </div>

      <PageSection
        title="Workspace Control Center"
        description="These defaults feed onboarding, documents, settlement controls, and digital verification behavior."
      >
        <WorkspaceSettingsCard
          settings={data.workspaceSettings}
          onSave={(nextSettings) =>
            setData((prev) => ({
              ...prev,
              workspaceSettings: nextSettings,
            }))
          }
        />
      </PageSection>

      <PageSection
        title="Access & Identity"
        description="Google is the preferred identity path, with backup sign-in available for continuity."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <WorkbenchRecordCard
            title="Current User"
            subtitle={auth.currentUser?.email || auth.currentUser?.phone || auth.currentUser?.userHandle || 'No active user'}
            summaryItems={[
              { label: 'Name', value: auth.currentUser?.name || 'Not set' },
              { label: 'User ID', value: auth.currentUser?.userHandle || 'No backup user ID saved' },
              { label: 'Verified', value: auth.currentUser?.isVerified ? 'Yes' : 'Not yet' },
              { label: 'Drive Access', value: auth.hasDriveAccess ? 'Connected' : 'Not connected' },
            ]}
          >
            Use Google as the main sign-in path. Backup email, phone, and user-ID access remain available if the user has set them up during verification or onboarding.
          </WorkbenchRecordCard>

          <WorkbenchRecordCard
            title="Sign-In Policy"
            subtitle="Recommended front-door behavior"
            summaryItems={[
              { label: 'Primary', value: 'Google sign-in' },
              { label: 'Backup', value: 'Email / phone / user ID + password' },
              { label: 'Verification', value: 'Email or phone challenge flow' },
              { label: 'Environment', value: auth.isConfigured ? 'Production-capable' : 'Local fallback mode' },
            ]}
          >
            The welcome flow now starts with just two choices, then guides existing users into Google first while still preserving backup continuity paths.
          </WorkbenchRecordCard>

          <WorkbenchRecordCard
            title="Backup Access Controls"
            subtitle="Set or update backup user ID and password"
          >
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {(['email', 'phone'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPreferredContactType(option)}
                    style={{
                      minHeight: 38,
                      padding: '0 12px',
                      borderRadius: 12,
                      border:
                        preferredContactType === option
                          ? '1px solid rgba(126, 242, 255, 0.34)'
                          : '1px solid rgba(255,255,255,0.12)',
                      background:
                        preferredContactType === option
                          ? 'rgba(54, 215, 255, 0.12)'
                          : 'rgba(255,255,255,0.04)',
                      color: '#eff6fb',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {option === 'email' ? 'Email Backup' : 'Phone Backup'}
                  </button>
                ))}
              </div>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Backup User ID</span>
                <input
                  value={backupUserId}
                  onChange={(event) => setBackupUserId(event.target.value)}
                  placeholder="your.userid"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Backup Password</span>
                <input
                  type="password"
                  value={backupPassword}
                  onChange={(event) => setBackupPassword(event.target.value)}
                  placeholder="Set or rotate your backup password"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <div style={{ color: 'var(--cf-muted)', lineHeight: 1.7 }}>
                Google remains the primary sign-in path. These backup credentials let the same
                user keep alternate access by password or verification code when needed.
              </div>
              <button
                type="button"
                onClick={handleSaveBackupAccess}
                disabled={isSavingBackup || (!backupUserId.trim() && !backupPassword.trim())}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(126, 242, 255, 0.28)',
                  background:
                    'linear-gradient(135deg, rgba(33, 194, 198, 0.9), rgba(88, 141, 255, 0.82))',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                  opacity:
                    isSavingBackup || (!backupUserId.trim() && !backupPassword.trim()) ? 0.6 : 1,
                }}
              >
                {isSavingBackup ? 'Saving Backup Access...' : 'Save Backup Access'}
              </button>
              {backupError ? (
                <div style={{ color: '#fecaca', lineHeight: 1.6 }}>{backupError}</div>
              ) : null}
              {backupNotice ? (
                <div style={{ color: '#bbf7d0', lineHeight: 1.6 }}>{backupNotice}</div>
              ) : null}
            </div>
          </WorkbenchRecordCard>
        </div>
      </PageSection>

      <PageSection
        title="Integration Readiness"
        description="Live status for the backend, Google, email, SMS, and Plaid support needed for full production behavior."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <WorkbenchRecordCard
            title="Runtime Status"
            subtitle={integrationLoading ? 'Checking integrations...' : integrationStatus?.backendReachable ? 'Backend reachable' : 'Backend not reachable'}
            summaryItems={[
              { label: 'API Base', value: integrationStatus?.apiBaseUrl || 'Checking...' },
              { label: 'Google Client', value: integrationStatus?.googleClientIdPresent ? 'Configured' : 'Missing' },
              { label: 'SMTP', value: integrationStatus?.smtpConfigured ? 'Configured' : 'Missing' },
              { label: 'SMS', value: integrationStatus?.smsConfigured ? `Configured (${integrationStatus.smsProvider || 'provider'})` : 'Missing' },
              { label: 'Plaid', value: integrationStatus?.plaidConfigured ? 'Configured' : 'Missing' },
            ]}
          >
            {integrationStatus?.backendReachable
              ? 'Core backend endpoints are reachable from this app. Live verification, delivery, and bank integration depend on the remaining configured services.'
              : 'The frontend is running, but the backend is not reachable from this environment right now. External delivery and live integration flows will fall back or stay unavailable until it is reachable.'}
          </WorkbenchRecordCard>

          <WorkbenchRecordCard
            title="Go-Live Checklist"
            subtitle="What still has to be true for full production function"
          >
            <div style={{ display: 'grid', gap: 8, color: '#d1d5db', lineHeight: 1.7 }}>
              <div>1. Google OAuth origins must match the live domains and localhost origins.</div>
              <div>2. SMTP must be configured for direct email delivery and email verification.</div>
              <div>3. SMS provider credentials must be configured for live phone verification.</div>
              <div>4. Plaid credentials and backend hosting must be live for bank-feed sync.</div>
              <div>5. Backend must stay reachable from the deployed frontend for all external actions.</div>
            </div>
          </WorkbenchRecordCard>
        </div>
      </PageSection>

      <PageSection
        title="Reserved Control Surfaces"
        description="Configuration layers still ready for deeper operational controls."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          <WorkbenchRecordCard
            title="Vault Settings"
            subtitle="Document storage, path rules, retention logic"
          >
            Next layer: route uploads to durable storage profiles, archive policies, and controlled export bundles.
          </WorkbenchRecordCard>
          <WorkbenchRecordCard
            title="Compliance Settings"
            subtitle="Classification defaults, reporting flags, review logic"
          >
            Next layer: entity-specific review rules, filing calendars, trustee reminders, and digital asset policy controls.
          </WorkbenchRecordCard>
          <WorkbenchRecordCard
            title="User Settings"
            subtitle="Workspace profile, entity defaults, permissions"
          >
            Next layer: role authority, dual-approval remittance controls, and signer permission boundaries.
          </WorkbenchRecordCard>
          <WorkbenchRecordCard
            title="Environment Settings"
            subtitle="Integrations, chains, custody endpoints, accounting rails"
          >
            Next layer: hosted bank feed runtime, wallet providers, ACH processors, and production messaging services.
          </WorkbenchRecordCard>
        </div>
      </PageSection>
    </div>
  );
}
