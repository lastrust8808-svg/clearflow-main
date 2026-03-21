import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface ComplianceWorkbenchPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function ComplianceWorkbenchPage({
  data,
  setData,
}: ComplianceWorkbenchPageProps) {
  const reviewCount = data.complianceTags.filter((item) => item.status === 'review').length;
  const digitalReviewCount = data.digitalAssetCompliance.filter(
    (item) =>
      item.sourceOfFundsRecordStatus !== 'complete' ||
      item.counterpartyOrProtocolRisk === 'high'
  ).length;
  const dueSoon = data.complianceTags.filter((item) => item.dueDate).length;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Compliance & Reports</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Entity obligations, digital-asset review tags, reporting readiness, and classification tracking.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Compliance Tags" value={data.complianceTags.length} />
        <StatCard label="General Review Items" value={reviewCount} />
        <StatCard label="Digital Asset Reviews" value={data.digitalAssetCompliance.length} />
        <StatCard label="Escalated Digital Reviews" value={digitalReviewCount} />
        <StatCard label="Dated Obligations" value={dueSoon} />
      </div>

      <PageSection
        title="Priority Queue"
        description="The first things a real operator should touch instead of scrolling through raw records."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.complianceTags
            .filter((item) => item.status === 'review' || item.dueDate)
            .map((item) => (
              <WorkbenchRecordCard
                key={item.id}
                title={item.label}
                subtitle={`${item.category} | ${item.status}`}
                summaryItems={[
                  { label: 'Entity', value: data.entities.find((entity) => entity.id === item.entityId)?.displayName || 'Workspace-wide' },
                  { label: 'Jurisdiction', value: item.jurisdiction || 'Not set' },
                  { label: 'Due Date', value: item.dueDate || 'No due date' },
                  { label: 'Linked Docs', value: item.linkedDocumentIds?.length || 0 },
                ]}
                record={item}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    complianceTags: prev.complianceTags.map((row) =>
                      row.id === item.id ? nextRecord : row
                    ),
                  }))
                }
                actionSlot={
                  item.linkedDocumentIds?.[0] ? (
                    <button
                      type="button"
                      onClick={() => {
                        window.location.hash = `documents:${item.linkedDocumentIds?.[0]}`;
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(96,165,250,0.4)',
                        background: 'rgba(37,99,235,0.18)',
                        color: '#e5e7eb',
                        cursor: 'pointer',
                      }}
                    >
                      Open Packet
                    </button>
                  ) : undefined
                }
              >
                {item.notes || 'Use advanced edit if you need to alter linked document IDs or category metadata.'}
              </WorkbenchRecordCard>
            ))}
        </div>
      </PageSection>

      <PageSection
        title="General Compliance Desk"
        description="Entity, reporting, tax, jurisdiction, and authority controls."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.complianceTags.map((item) => (
            <WorkbenchRecordCard
              key={item.id}
              title={item.label}
              subtitle={`${item.category} | ${item.status}`}
              summaryItems={[
                { label: 'Entity', value: data.entities.find((entity) => entity.id === item.entityId)?.displayName || 'Workspace-wide' },
                { label: 'Jurisdiction', value: item.jurisdiction || 'Not set' },
                { label: 'Due', value: item.dueDate || 'Not dated' },
                { label: 'Docs', value: item.linkedDocumentIds?.length || 0 },
              ]}
              record={item}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  complianceTags: prev.complianceTags.map((row) =>
                    row.id === item.id ? nextRecord : row
                  ),
                }))
              }
            >
              {item.notes || 'Review status, due dates, and linked evidence live here.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Digital Asset Classification Desk"
        description="Classification, source-of-funds readiness, and protocol/counterparty risk."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.digitalAssetCompliance.map((item) => (
            <WorkbenchRecordCard
              key={item.id}
              title={item.assetType}
              subtitle={`Custody: ${item.custodyModel} | Flag: ${item.securitiesCommodityPaymentFlag}`}
              summaryItems={[
                { label: 'Risk', value: item.counterpartyOrProtocolRisk },
                { label: 'Source Of Funds', value: item.sourceOfFundsRecordStatus },
                { label: 'Tax Treatment', value: item.taxTreatmentTag },
                { label: 'Reporting', value: item.reportingRequirements.join(', ') },
              ]}
              record={item}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  digitalAssetCompliance: prev.digitalAssetCompliance.map((row) =>
                    row.id === item.id ? nextRecord : row
                  ),
                }))
              }
            >
              {item.notes || 'Use advanced edit to add reporting rules, risk notes, and linked asset references.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
