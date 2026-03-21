import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import RecordEditorCard from '../ui/RecordEditorCard';

interface AIStudioPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function AIStudioPage({ data, setData }: AIStudioPageProps) {
  const digitalCount = data.aiWorkflows.filter((item) => item.category === 'digital_asset').length;
  const complianceCount = data.aiWorkflows.filter((item) => item.category === 'compliance').length;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>AI Studio</h1>
        <p style={{ color: '#9ca3af', marginBottom: 0 }}>
          Generators for token docs, reserve memos, compliance snapshots, and control records.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Workflows" value={data.aiWorkflows.length} />
        <StatCard label="Digital Asset Workflows" value={digitalCount} />
        <StatCard label="Compliance Workflows" value={complianceCount} />
        <StatCard label="Output Formats" value="DOCX / PDF / Markdown" />
      </div>

      <PageSection title="Generator Catalog" description="Editable AI workflow records.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.aiWorkflows.map((workflow) => (
            <div key={workflow.id}>
              <RecordEditorCard
                title={workflow.name}
                subtitle={workflow.category}
                record={workflow}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    aiWorkflows: prev.aiWorkflows.map((item) =>
                      item.id === workflow.id ? nextRecord : item
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
