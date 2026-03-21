import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import RecordEditorCard from '../ui/RecordEditorCard';

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

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Compliance</h1>
        <p style={{ color: '#9ca3af', marginBottom: 0 }}>
          Entity obligations, digital-asset review tags, and classification tracking.
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
      </div>

      <PageSection title="General Compliance" description="Editable compliance tags.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.complianceTags.map((item) => (
            <div key={item.id}>
              {item.linkedDocumentIds?.length ? (
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>
                    Linked docs:{' '}
                    {item.linkedDocumentIds
                      .map((id) => data.documents.find((doc) => doc.id === id)?.title || id)
                      .join(' | ')}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = item.linkedDocumentIds?.[0];
                      if (targetId) {
                        window.location.hash = `documents:${targetId}`;
                      }
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
                    Open Kickoff Doc
                  </button>
                </div>
              ) : null}
              <RecordEditorCard
                title={item.label}
                subtitle={`${item.category} · ${item.status}`}
                record={item}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    complianceTags: prev.complianceTags.map((row) =>
                      row.id === item.id ? nextRecord : row
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Digital Asset Classification"
        description="Editable digital compliance records."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.digitalAssetCompliance.map((item) => (
            <div key={item.id}>
              <RecordEditorCard
                title={item.assetType}
                subtitle={`Custody: ${item.custodyModel} · Flag: ${item.securitiesCommodityPaymentFlag}`}
                record={item}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    digitalAssetCompliance: prev.digitalAssetCompliance.map((row) =>
                      row.id === item.id ? nextRecord : row
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
