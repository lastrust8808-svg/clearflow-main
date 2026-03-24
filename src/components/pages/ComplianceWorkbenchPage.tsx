import type { Dispatch, SetStateAction } from 'react';
import type { ComplianceStatus, CoreDataBundle } from '../../types/core';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';

interface ComplianceWorkbenchPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

function goToHash(hash: string) {
  if (typeof window !== 'undefined') {
    window.location.hash = hash;
  }
}

const cardStyle = {
  display: 'grid',
  gap: 14,
  borderRadius: 18,
  padding: 16,
  background: 'rgba(15,23,42,0.45)',
  border: '1px solid rgba(148,163,184,0.18)',
};

const inputStyle = {
  width: '100%',
  minHeight: 40,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.55)',
  color: '#e5e7eb',
  boxSizing: 'border-box' as const,
};

const chipStyle = (active: boolean) => ({
  padding: '8px 11px',
  borderRadius: 999,
  border: active ? '1px solid rgba(126,242,255,0.38)' : '1px solid rgba(148,163,184,0.2)',
  background: active ? 'rgba(54, 215, 255, 0.12)' : 'rgba(255,255,255,0.04)',
  color: '#effcff',
  cursor: 'pointer',
  fontWeight: 700,
});

export default function ComplianceWorkbenchPage({
  data,
  setData,
}: ComplianceWorkbenchPageProps) {
  const reviewCount = data.complianceTags.filter((item) => item.status === 'review').length;
  const digitalReviewCount = data.digitalAssetCompliance.filter(
    (item) =>
      item.sourceOfFundsRecordStatus !== 'complete' ||
      item.counterpartyOrProtocolRisk === 'high',
  ).length;
  const dueSoon = data.complianceTags.filter((item) => item.dueDate).length;
  const filingReadyCount = data.taxReportingLinks.filter(
    (item) => item.status === 'draft' || item.status === 'corrected',
  ).length;

  const updateComplianceTag = (
    id: string,
    patch: Partial<CoreDataBundle['complianceTags'][number]>,
  ) =>
    setData((prev) => ({
      ...prev,
      complianceTags: prev.complianceTags.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));

  const updateDigitalReview = (
    id: string,
    patch: Partial<CoreDataBundle['digitalAssetCompliance'][number]>,
  ) =>
    setData((prev) => ({
      ...prev,
      digitalAssetCompliance: prev.digitalAssetCompliance.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));

  const updateTaxLink = (
    id: string,
    patch: Partial<CoreDataBundle['taxReportingLinks'][number]>,
  ) =>
    setData((prev) => ({
      ...prev,
      taxReportingLinks: prev.taxReportingLinks.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));

  const renderStatusActions = (id: string, currentStatus: ComplianceStatus) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {(['ok', 'review', 'restricted', 'unknown'] as const).map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => updateComplianceTag(id, { status })}
          style={chipStyle(status === currentStatus)}
        >
          {status === 'ok'
            ? 'Clear'
            : status === 'review'
              ? 'Needs Review'
              : status === 'restricted'
                ? 'Restrict'
                : 'Unknown'}
        </button>
      ))}
    </div>
  );

  const resolveComplianceAction = (item: CoreDataBundle['complianceTags'][number]) => {
    if (item.linkedDocumentIds?.[0]) {
      return { label: 'Open Packet', hash: `#documents:${item.linkedDocumentIds[0]}` };
    }

    if (item.category === 'tax' || item.category === 'reporting') {
      return { label: 'Open Filing Desk', hash: '#compliance' };
    }

    if (item.category === 'authority' || item.category === 'entity') {
      return { label: 'Open Entities', hash: '#entities' };
    }

    return { label: 'Open Compliance', hash: '#compliance' };
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Compliance & Reports</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Entity obligations, digital-asset review tags, reporting readiness, and classification
          tracking.
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
        <StatCard label="Tax Filing Links" value={data.taxReportingLinks.length} />
        <StatCard label="Filing Review Queue" value={filingReadyCount} />
      </div>

      <PageSection
        title="Priority Queue"
        description="The first things a real operator should touch instead of scrolling through raw records."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.complianceTags
            .filter((item) => item.status === 'review' || item.dueDate)
            .map((item) => (
              <div key={item.id} style={cardStyle}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{item.label}</div>
                    <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                      {item.category} | {item.status} |{' '}
                      {data.entities.find((entity) => entity.id === item.entityId)?.displayName ||
                        'Workspace-wide'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToHash(resolveComplianceAction(item).hash)}
                    style={chipStyle(false)}
                  >
                    {resolveComplianceAction(item).label}
                  </button>
                </div>

                {renderStatusActions(item.id, item.status)}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 12,
                  }}
                >
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>Due Date</span>
                    <input
                      type="date"
                      value={item.dueDate || ''}
                      onChange={(event) => updateComplianceTag(item.id, { dueDate: event.target.value })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>Jurisdiction</span>
                    <input
                      type="text"
                      value={item.jurisdiction || ''}
                      onChange={(event) =>
                        updateComplianceTag(item.id, { jurisdiction: event.target.value })
                      }
                      style={inputStyle}
                    />
                  </label>
                </div>

                <textarea
                  value={item.notes || ''}
                  onChange={(event) => updateComplianceTag(item.id, { notes: event.target.value })}
                  placeholder="Compliance note or follow-up"
                  style={{
                    ...inputStyle,
                    minHeight: 110,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            ))}
        </div>
      </PageSection>

      <PageSection
        title="General Compliance Desk"
        description="Entity, reporting, tax, jurisdiction, and authority controls."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.complianceTags.map((item) => (
            <div key={item.id} style={cardStyle}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{item.label}</div>
                <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                  {item.category} |{' '}
                  {data.entities.find((entity) => entity.id === item.entityId)?.displayName ||
                    'Workspace-wide'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => goToHash(resolveComplianceAction(item).hash)}
                  style={chipStyle(false)}
                >
                  {resolveComplianceAction(item).label}
                </button>
              </div>

              {renderStatusActions(item.id, item.status)}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Due Date</span>
                  <input
                    type="date"
                    value={item.dueDate || ''}
                    onChange={(event) => updateComplianceTag(item.id, { dueDate: event.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Jurisdiction</span>
                  <input
                    type="text"
                    value={item.jurisdiction || ''}
                    onChange={(event) =>
                      updateComplianceTag(item.id, { jurisdiction: event.target.value })
                    }
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Digital Asset Classification Desk"
        description="Classification, source-of-funds readiness, and protocol/counterparty risk."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.digitalAssetCompliance.map((item) => (
            <div key={item.id} style={cardStyle}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{item.assetType}</div>
                <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                  {item.custodyModel} | {item.securitiesCommodityPaymentFlag} |{' '}
                  {data.entities.find((entity) => entity.id === item.entityId)?.displayName || item.entityId}
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
                  <span>Protocol / Counterparty Risk</span>
                  <select
                    value={item.counterpartyOrProtocolRisk}
                    onChange={(event) =>
                      updateDigitalReview(item.id, {
                        counterpartyOrProtocolRisk: event.target.value as
                          | 'low'
                          | 'medium'
                          | 'high'
                          | 'unknown',
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Source of Funds</span>
                  <select
                    value={item.sourceOfFundsRecordStatus}
                    onChange={(event) =>
                      updateDigitalReview(item.id, {
                        sourceOfFundsRecordStatus: event.target.value as
                          | 'complete'
                          | 'partial'
                          | 'missing'
                          | 'unknown',
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="complete">Complete</option>
                    <option value="partial">Partial</option>
                    <option value="missing">Missing</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Tax Treatment</span>
                  <input
                    type="text"
                    value={item.taxTreatmentTag}
                    onChange={(event) =>
                      updateDigitalReview(item.id, { taxTreatmentTag: event.target.value })
                    }
                    style={inputStyle}
                  />
                </label>
              </div>

              <textarea
                value={item.notes || ''}
                onChange={(event) => updateDigitalReview(item.id, { notes: event.target.value })}
                placeholder="Classification notes or protocol review guidance"
                style={{
                  ...inputStyle,
                  minHeight: 110,
                  fontFamily: 'inherit',
                }}
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Tax & Filing Desk"
        description="1099 review links, TIN match posture, and filing-channel readiness tied back to ERP disbursements."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.taxReportingLinks.length === 0 ? (
            <div style={cardStyle}>No tax reporting links have been created yet.</div>
          ) : (
            data.taxReportingLinks.map((item) => (
              <div key={item.id} style={cardStyle}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{item.counterpartyName}</div>
                    <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                      {item.formType || 'reporting link'} | {item.status} | TIN {item.tinMatchStatus}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() =>
                        goToHash(item.linkedPaymentId ? '#accounting:payments' : '#accounting:dashboard')
                      }
                      style={chipStyle(false)}
                    >
                      {item.linkedPaymentId ? 'Open Payment' : 'Open Accounting'}
                    </button>
                    {(['draft', 'filed', 'accepted', 'corrected'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => updateTaxLink(item.id, { status })}
                        style={chipStyle(item.status === status)}
                      >
                        {status === 'draft'
                          ? 'Draft'
                          : status === 'filed'
                            ? 'Filed'
                            : status === 'accepted'
                              ? 'Accepted'
                              : 'Corrected'}
                      </button>
                    ))}
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
                    <span>Filing Channel</span>
                    <select
                      value={item.filingChannel || 'manual'}
                      onChange={(event) =>
                        updateTaxLink(item.id, {
                          filingChannel: event.target.value as 'IRIS' | 'FIRE' | 'manual',
                        })
                      }
                      style={inputStyle}
                    >
                      <option value="manual">Manual</option>
                      <option value="IRIS">IRIS</option>
                      <option value="FIRE">FIRE</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>TIN Match</span>
                    <select
                      value={item.tinMatchStatus}
                      onChange={(event) =>
                        updateTaxLink(item.id, {
                          tinMatchStatus: event.target.value as
                            | 'not_checked'
                            | 'matched'
                            | 'mismatch'
                            | 'pending',
                        })
                      }
                      style={inputStyle}
                    >
                      <option value="not_checked">Not checked</option>
                      <option value="pending">Pending</option>
                      <option value="matched">Matched</option>
                      <option value="mismatch">Mismatch</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>Submission ID</span>
                    <input
                      type="text"
                      value={item.submissionId || ''}
                      onChange={(event) =>
                        updateTaxLink(item.id, { submissionId: event.target.value })
                      }
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>TCC</span>
                    <input
                      type="text"
                      value={item.tcc || ''}
                      onChange={(event) => updateTaxLink(item.id, { tcc: event.target.value })}
                      style={inputStyle}
                    />
                  </label>
                </div>

                <textarea
                  value={item.notes || ''}
                  onChange={(event) => updateTaxLink(item.id, { notes: event.target.value })}
                  placeholder="Filing note, exception, or submission follow-up"
                  style={{
                    ...inputStyle,
                    minHeight: 110,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            ))
          )}
        </div>
      </PageSection>
    </div>
  );
}
