import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import WorkspaceSettingsCard from '../settings/WorkspaceSettingsCard';
import PageSection from '../ui/PageSection';
import RecordCard from '../ui/RecordCard';
import StatCard from '../ui/StatCard';

interface SettingsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function SettingsPage({ data, setData }: SettingsPageProps) {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Settings</h1>
        <p style={{ color: '#9ca3af', marginBottom: 0 }}>
          Workspace-wide defaults for identity, settlement, vault discipline, and verification.
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
        title="Planned Settings Surfaces"
        description="Reserved configuration areas that will sit on top of the workspace defaults."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          <RecordCard title="Vault Settings" subtitle="Document storage, path rules, retention logic" />
          <RecordCard title="Compliance Settings" subtitle="Classification defaults, reporting flags, review logic" />
          <RecordCard title="User Settings" subtitle="Workspace profile, entity defaults, permissions" />
          <RecordCard title="Environment Settings" subtitle="Integrations, chains, custody endpoints, accounting rails" />
        </div>
      </PageSection>
    </div>
  );
}
