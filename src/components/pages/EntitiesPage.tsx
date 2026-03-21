import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import PageSection from '../ui/PageSection';
import EntityProfileCard from '../entities/EntityProfileCard';
import StatCard from '../ui/StatCard';

interface EntitiesPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function EntitiesPage({ data, setData }: EntitiesPageProps) {
  const activeEntities = data.entities.filter((entity) => entity.status === 'active').length;
  const tokenEnabledEntities = data.entities.filter(
    (entity) => entity.operationalDefaults?.autoIssueVerificationTokens
  ).length;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Entities</h1>
        <p style={{ color: '#9ca3af', marginBottom: 0 }}>
          Entity records, workspace identity, and operational defaults for the operating system.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Entities" value={String(data.entities.length)} />
        <StatCard label="Active Profiles" value={String(activeEntities)} />
        <StatCard label="Token-Ready Defaults" value={String(tokenEnabledEntities)} />
      </div>

      <PageSection
        title="Entity Records"
        description="Edit legal identity, numbering, branding, and default settlement behavior without touching raw JSON."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.entities.map((entity) => (
            <div key={entity.id}>
              <EntityProfileCard
                entity={entity}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    entities: prev.entities.map((item) =>
                      item.id === entity.id ? nextRecord : item
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>
    </div>
  );
}

