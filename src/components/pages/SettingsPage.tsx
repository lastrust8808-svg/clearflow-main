import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import { useAuth } from '../../hooks/useAuth';
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
