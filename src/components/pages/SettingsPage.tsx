import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import { useAuth } from '../../hooks/useAuth';
import {
  isClearFlowRetainedDocument,
  isUserOwnedReadyDocument,
} from '../../services/documentStorage.service';
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
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusSnapshot | null>(null);
  const [integrationLoading, setIntegrationLoading] = useState(true);
  const retainedDocumentCount = data.documents.filter(isClearFlowRetainedDocument).length;
  const userOwnedReadyCount = data.documents.filter(isUserOwnedReadyDocument).length;
  const driveRoutedCount = data.documents.filter(
    (item) => item.externalStorageStatus === 'routed'
  ).length;

  useEffect(() => {
    void loadIntegrationStatus()
      .then((status) => setIntegrationStatus(status))
      .finally(() => setIntegrationLoading(false));
  }, []);

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
          value={auth.isConfigured ? 'Google first' : 'Google pending setup'}
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
        description="Google is the primary identity path, with retained platform records and user-owned storage where configured."
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
              { label: 'Verified', value: auth.currentUser?.isVerified ? 'Yes' : 'Not yet' },
              { label: 'Drive Access', value: auth.hasDriveAccess ? 'Connected' : 'Not connected' },
              { label: 'Terms Accepted', value: auth.currentUser?.clearflowTermsAcceptedAt ? 'Accepted' : 'Pending' },
            ]}
          >
            Use Google as the main sign-in path. ClearFlow retains only the required platform and custody records while letting user-owned workspace data stay external where that storage path is available.
          </WorkbenchRecordCard>

          <WorkbenchRecordCard
            title="Sign-In Policy"
            subtitle="Recommended front-door behavior"
            summaryItems={[
              { label: 'Primary', value: 'Google sign-in' },
              { label: 'Recovery', value: 'Google sign-in help request' },
              { label: 'Verification', value: 'Identity and agreement confirmation' },
              { label: 'Environment', value: auth.isConfigured ? 'Production-capable' : 'Local fallback mode' },
            ]}
          >
            The welcome flow now starts with just two choices, then guides existing users into Google first and routes new users into Google before onboarding.
          </WorkbenchRecordCard>

          <WorkbenchRecordCard
            title="Access Recovery Workflow"
            subtitle="When a user loses Google access or gets stuck during secure loading"
            summaryItems={[
              { label: 'Recovery Path', value: 'Google help request' },
              { label: 'Temporary Access', value: 'Handled by support request' },
              { label: 'Email Change', value: 'Secure handoff required' },
              { label: 'Current Runtime', value: auth.isConfigured ? 'Google-capable' : 'Config pending' },
            ]}
            actionSlot={
              <a
                href="mailto:billing@clearflow.site?subject=ClearFlow%20Access%20Recovery%20Request"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 42,
                  padding: '0 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(126, 242, 255, 0.24)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Request Access Help
              </a>
            }
          >
            If a user can no longer use the original Google account, ClearFlow should recover access through a support-led handoff instead of exposing backup sign-in clutter on the front door.
          </WorkbenchRecordCard>

          <WorkbenchRecordCard
            title="ClearFlow Retained Records"
            subtitle="Required internal agreement and custody support retained by the platform"
            summaryItems={[
              { label: 'Retained Docs', value: retainedDocumentCount },
              { label: 'User-Owned Ready', value: userOwnedReadyCount },
              { label: 'Drive Routed', value: driveRoutedCount },
              { label: 'Terms Version', value: auth.currentUser?.clearflowTermsVersion || 'Pending' },
              { label: 'Drive Access', value: auth.hasDriveAccess ? 'Connected' : 'Not connected' },
            ]}
          >
            <div style={{ display: 'grid', gap: 10, color: '#d1d5db', lineHeight: 1.7 }}>
              <div>Signer: {auth.currentUser?.clearflowTermsSignerName || 'Not recorded yet'}</div>
              <div>Accepted at: {auth.currentUser?.clearflowTermsAcceptedAt || 'Pending acceptance'}</div>
              <div>Terms record: {auth.currentUser?.clearflowTermsDocumentId || 'Not created yet'}</div>
              <div>Retained record: {auth.currentUser?.clearflowRetainedRecordDocumentId || 'Not created yet'}</div>
              <div style={{ color: 'var(--cf-muted)' }}>
                These are the internal records ClearFlow keeps for platform agreement, security support, and retained custody/compliance posture.
              </div>
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
            <div style={{ display: 'grid', gap: 8, color: '#d1d5db', lineHeight: 1.7 }}>
              <div>User-owned ready documents: {userOwnedReadyCount}</div>
              <div>ClearFlow retained documents: {retainedDocumentCount}</div>
              <div>Drive-routed documents: {driveRoutedCount}</div>
              <div style={{ color: 'var(--cf-muted)' }}>
                The storage split is now explicit in the document model, so user-owned workspace files and retained platform records can route differently without title-based guessing.
              </div>
            </div>
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
