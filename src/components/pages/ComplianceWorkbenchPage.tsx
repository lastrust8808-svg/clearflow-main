import type { Dispatch, SetStateAction } from 'react';
import type { ComplianceStatus, CoreDataBundle } from '../../types/core';
import { buildPrivateWealthRailSummaries } from '../../services/privateWealthRail.service';
import { buildTransactionProofChainViews } from '../../services/transactionProofChain.service';
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
  const privateWealthRailSummaries = buildPrivateWealthRailSummaries(data);
  const transactionProofChains = buildTransactionProofChainViews(data);
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
  const wealthRailWatchCount = privateWealthRailSummaries.filter(
    (item) => item.overallStatus !== 'ready',
  ).length;
  const kybReviewCount = data.kybReviews.filter((item) => item.status !== 'cleared').length;
  const watchlistQueueCount = data.watchlistScreenings.filter(
    (item) => item.status !== 'clear' || item.disposition === 'pending_review',
  ).length;
  const amlCaseCount = data.amlCases.filter((item) => item.status !== 'closed').length;
  const proofChainWatchCount = transactionProofChains.filter(
    (item) => item.verificationStatus !== 'sealed',
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

  const updateKybReview = (
    id: string,
    patch: Partial<CoreDataBundle['kybReviews'][number]>,
  ) =>
    setData((prev) => ({
      ...prev,
      kybReviews: prev.kybReviews.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));

  const updateWatchlistScreening = (
    id: string,
    patch: Partial<CoreDataBundle['watchlistScreenings'][number]>,
  ) =>
    setData((prev) => ({
      ...prev,
      watchlistScreenings: prev.watchlistScreenings.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));

  const updateAmlCase = (
    id: string,
    patch: Partial<CoreDataBundle['amlCases'][number]>,
  ) =>
    setData((prev) => ({
      ...prev,
      amlCases: prev.amlCases.map((row) => (row.id === id ? { ...row, ...patch } : row)),
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
          Entity obligations, KYC / KYB refresh, watchlist screening, casework, digital-asset
          review tags, and reporting readiness in one operating desk.
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
        <StatCard label="KYC / KYB Reviews" value={kybReviewCount} />
        <StatCard label="Watchlist Queue" value={watchlistQueueCount} />
        <StatCard label="AML Casework" value={amlCaseCount} />
        <StatCard label="Wealth Rail Watchlist" value={wealthRailWatchCount} />
        <StatCard label="Proof Chain Watchlist" value={proofChainWatchCount} />
      </div>

      <PageSection
        title="KYC / KYB & Ownership Reviews"
        description="Ongoing entity review, beneficial-owner refresh, document coverage, and screening posture before outside banking or payment use."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.kybReviews.map((review) => (
            <div key={review.id} style={cardStyle}>
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
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {data.entities.find((entity) => entity.id === review.entityId)?.displayName ||
                      review.entityId}
                  </div>
                  <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                    {review.reviewType.replace(/_/g, ' ')} | {review.status} | next{' '}
                    {review.nextReviewDate || 'not scheduled'}
                  </div>
                </div>
                <button type="button" onClick={() => goToHash('#entities')} style={chipStyle(false)}>
                  Open Entity
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Owners / Coverage</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {review.beneficialOwnerCount ?? 0} owners | {review.documentCoverage}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Screening</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{review.screeningStatus}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Review Date</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{review.reviewDate}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['pending', 'in_review', 'cleared', 'restricted'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateKybReview(review.id, { status })}
                    style={chipStyle(status === review.status)}
                  >
                    {status.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              <textarea
                value={review.notes || ''}
                onChange={(event) => updateKybReview(review.id, { notes: event.target.value })}
                placeholder="KYC / KYB review notes"
                style={{ ...inputStyle, minHeight: 92, fontFamily: 'inherit' }}
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Watchlist & Screening Queue"
        description="Sanctions, PEP, adverse-media, and screening follow-up items that other banking and compliance platforms treat as core onboarding controls."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.watchlistScreenings.map((screening) => (
            <div key={screening.id} style={cardStyle}>
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
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{screening.subjectLabel}</div>
                  <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                    {screening.subjectType} | {screening.screeningScope} | {screening.status}
                  </div>
                </div>
                <button type="button" onClick={() => goToHash('#compliance')} style={chipStyle(false)}>
                  Review Queue
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Screened / Next</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {screening.screenedAt} | {screening.nextScreeningDate || 'not scheduled'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Provider / Match</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {screening.providerLabel || 'internal'} | {screening.matchedListName || 'none'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Disposition</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{screening.disposition}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['clear', 'watch', 'potential_match', 'confirmed_match'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateWatchlistScreening(screening.id, { status })}
                    style={chipStyle(status === screening.status)}
                  >
                    {status.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              <textarea
                value={screening.notes || ''}
                onChange={(event) =>
                  updateWatchlistScreening(screening.id, { notes: event.target.value })
                }
                placeholder="Screening notes and disposition support"
                style={{ ...inputStyle, minHeight: 92, fontFamily: 'inherit' }}
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="AML Casework & Filing Prep"
        description="Case handling for suspicious activity, currency activity, watchlist escalation, and refresh work before SAR or CTR preparation."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.amlCases.map((amlCase) => (
            <div key={amlCase.id} style={cardStyle}>
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
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{amlCase.title}</div>
                  <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                    {amlCase.caseType.replace(/_/g, ' ')} | {amlCase.priority} | {amlCase.status}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    goToHash(
                      amlCase.linkedDocumentIds?.[0]
                        ? `#documents:${amlCase.linkedDocumentIds[0]}`
                        : '#compliance',
                    )
                  }
                  style={chipStyle(false)}
                >
                  Open Packet
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Opened / Due</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {amlCase.openedAt} | {amlCase.dueDate || 'no due date'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Filing Path</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {amlCase.filingPath || 'internal_only'} | {amlCase.filingStatus || 'not_started'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Retention Until</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {amlCase.retentionUntil || 'not set'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['open', 'under_review', 'filed', 'closed'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateAmlCase(amlCase.id, { status })}
                    style={chipStyle(status === amlCase.status)}
                  >
                    {status.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              <textarea
                value={amlCase.notes || ''}
                onChange={(event) => updateAmlCase(amlCase.id, { notes: event.target.value })}
                placeholder="AML case notes and filing rationale"
                style={{ ...inputStyle, minHeight: 92, fontFamily: 'inherit' }}
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Proof Chain Oversight"
        description="Encrypted movement and verification chains that still need stronger token, settlement, or identifier coverage."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {transactionProofChains.filter((item) => item.verificationStatus !== 'sealed').slice(0, 8).map((chain) => (
            <div key={chain.chainId} style={cardStyle}>
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
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{chain.title}</div>
                  <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                    {chain.chainId} | tx {chain.transactionId} | {chain.verificationStatus}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => goToHash('#transactions')}
                  style={chipStyle(false)}
                >
                  Open Proof Desk
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Settlement</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{chain.settlementId || 'Missing settlement link'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Payments / Identifiers</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {chain.paymentIds.length} payments | {chain.movementIdentifierIds.length} identifiers
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Verification Tokens</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {chain.tokenIds.length ? chain.tokenIds.join(', ') : 'Missing proof tokens'}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Watch Reasons</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {chain.watchReasons.join(' | ')}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {proofChainWatchCount === 0 ? (
            <div style={{ ...cardStyle, color: '#d1d5db' }}>
              No proof chains need compliance follow-up right now.
            </div>
          ) : null}
        </div>
      </PageSection>

      <PageSection
        title="Private Wealth Rail Oversight"
        description="Track which rails are suitable only for internal controlled booking, private instrument tracking, or which ones still require a partner bank or outside presentment channel."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {privateWealthRailSummaries.map((summary) => (
            <div key={summary.railId} style={cardStyle}>
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
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.railName}</div>
                  <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                    {summary.connectionName} | {summary.legalUsePosture.replace(/_/g, ' ')} |{' '}
                    {summary.overallStatus}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => goToHash('#entities')}
                  style={chipStyle(false)}
                >
                  Open Entity Rails
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Identifier Namespace</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{summary.identifierNamespace}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Operation Class</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    {summary.bankingOperationClass.replace(/_/g, ' ')}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>Outstanding Exposure</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    USD {summary.outstandingExposure.toLocaleString()}
                  </div>
                </div>
              </div>

              <textarea
                readOnly
                value={
                  summary.warnings.length
                    ? summary.warnings.join('\n')
                    : 'No additional control warnings.'
                }
                style={{
                  ...inputStyle,
                  minHeight: 96,
                  fontFamily: 'inherit',
                }}
              />
            </div>
          ))}
        </div>
      </PageSection>

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
