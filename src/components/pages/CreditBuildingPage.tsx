import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type {
  CoreDataBundle,
  CreditBureauName,
  CreditProfileType,
  CreditTradelineRecord,
} from '../../types/core';
import PageSection from '../ui/PageSection';

interface CreditBuildingPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
  activeEntityId?: string | null;
}

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: 42,
  borderRadius: 10,
  border: '1px solid var(--cf-border)',
  background: 'rgba(10,16,28,0.7)',
  color: 'var(--cf-text)',
  padding: '0 11px',
  boxSizing: 'border-box',
};

const buttonStyle = (primary = false): CSSProperties => ({
  minHeight: 40,
  borderRadius: 10,
  border: primary
    ? '1px solid rgba(126,242,255,0.34)'
    : '1px solid var(--cf-border)',
  background: primary
    ? 'rgba(54,215,255,0.12)'
    : 'rgba(255,255,255,0.035)',
  color: primary ? 'var(--cf-accent-soft)' : 'var(--cf-text)',
  padding: '8px 12px',
  cursor: 'pointer',
  fontWeight: 750,
});

const cardStyle: CSSProperties = {
  border: '1px solid var(--cf-border)',
  borderRadius: 14,
  background: 'rgba(255,255,255,0.025)',
  padding: 12,
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function utilization(record: CreditTradelineRecord) {
  if (record.accountType !== 'revolving' || !record.creditLimit || record.creditLimit <= 0) {
    return null;
  }
  return Math.max(0, (record.balance / record.creditLimit) * 100);
}

function buildReviewIssues(record: CreditTradelineRecord) {
  const issues: Array<
    | 'balance_limit_conflict'
    | 'status_payment_conflict'
    | 'date_conflict'
    | 'past_due_conflict'
    | 'duplicate_reporting'
    | 'missing_key_field'
    | 'other'
  > = [];

  if (
    record.accountType === 'revolving' &&
    record.creditLimit &&
    record.creditLimit > 0 &&
    record.balance > record.creditLimit
  ) {
    issues.push('balance_limit_conflict');
  }
  if (
    (record.status === 'collection' || record.status === 'charged_off') &&
    record.paymentStatus === 'current'
  ) {
    issues.push('status_payment_conflict');
  }
  if ((record.pastDueAmount || 0) > 0 && record.paymentStatus === 'current') {
    issues.push('past_due_conflict');
  }
  if (record.firstDelinquencyDate && record.openedAt && record.firstDelinquencyDate < record.openedAt) {
    issues.push('date_conflict');
  }
  if (!record.reportedAt || !record.furnisherName.trim()) {
    issues.push('missing_key_field');
  }

  return issues;
}

export default function CreditBuildingPage({
  data,
  setData,
  activeEntityId,
}: CreditBuildingPageProps) {
  const [profileType, setProfileType] = useState<CreditProfileType>('personal');
  const [showAddTradeline, setShowAddTradeline] = useState(false);
  const [furnisherName, setFurnisherName] = useState('');
  const [bureau, setBureau] = useState<CreditBureauName>('experian');
  const [accountType, setAccountType] = useState<CreditTradelineRecord['accountType']>('revolving');
  const [status, setStatus] = useState<CreditTradelineRecord['status']>('open');
  const [paymentStatus, setPaymentStatus] = useState<CreditTradelineRecord['paymentStatus']>('current');
  const [balance, setBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [pastDue, setPastDue] = useState('');
  const [accountMask, setAccountMask] = useState('');
  const [reportedAt, setReportedAt] = useState('');
  const [notice, setNotice] = useState('');

  const navigate = (hash: string) => {
    if (typeof window !== 'undefined') window.location.hash = hash;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyHash = () => {
      if (window.location.hash === '#credit:new-tradeline') {
        setShowAddTradeline(true);
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}#credit`,
        );
      }
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const tradelines = useMemo(
    () =>
      data.creditTradelines.filter(
        (item) =>
          item.profileType === profileType &&
          (!activeEntityId || item.entityId === activeEntityId),
      ),
    [activeEntityId, data.creditTradelines, profileType],
  );

  const reviews = useMemo(() => {
    const tradelineIds = new Set(tradelines.map((item) => item.id));
    return data.creditReviews.filter(
      (item) =>
        tradelineIds.has(item.tradelineId) &&
        (!activeEntityId || item.entityId === activeEntityId),
    );
  }, [activeEntityId, data.creditReviews, tradelines]);

  const plans = useMemo(
    () =>
      data.creditBuildPlans.filter(
        (item) =>
          item.profileType === profileType &&
          (!activeEntityId || item.entityId === activeEntityId) &&
          item.status === 'active',
      ),
    [activeEntityId, data.creditBuildPlans, profileType],
  );

  const revolving = tradelines.filter(
    (item) => item.accountType === 'revolving' && item.status === 'open',
  );
  const totalBalance = revolving.reduce((sum, item) => sum + item.balance, 0);
  const totalLimit = revolving.reduce((sum, item) => sum + Number(item.creditLimit || 0), 0);
  const aggregateUtilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : null;
  const currentCount = tradelines.filter((item) => item.paymentStatus === 'current').length;
  const reviewCount = reviews.filter(
    (item) => item.status === 'review' || item.status === 'dispute_ready' || item.status === 'disputed',
  ).length;

  const addTradeline = () => {
    if (!furnisherName.trim()) {
      setNotice('Enter the furnisher or creditor name first.');
      return;
    }
    const numericBalance = Number(balance || 0);
    const numericLimit = creditLimit ? Number(creditLimit) : undefined;
    const numericPastDue = pastDue ? Number(pastDue) : undefined;
    const stamp = Date.now();

    const record: CreditTradelineRecord = {
      id: `credit-line-${stamp}`,
      entityId: activeEntityId || undefined,
      profileType,
      bureau,
      furnisherName: furnisherName.trim(),
      accountLabel: furnisherName.trim(),
      accountMask: accountMask.trim() || undefined,
      accountType,
      status,
      balance: Number.isFinite(numericBalance) ? numericBalance : 0,
      creditLimit:
        numericLimit !== undefined && Number.isFinite(numericLimit) ? numericLimit : undefined,
      pastDueAmount:
        numericPastDue !== undefined && Number.isFinite(numericPastDue) ? numericPastDue : undefined,
      paymentStatus,
      reportedAt: reportedAt || undefined,
      source: 'manual',
    };

    setData((prev) => ({
      ...prev,
      creditTradelines: [record, ...(prev.creditTradelines ?? [])],
    }));
    setFurnisherName('');
    setBalance('');
    setCreditLimit('');
    setPastDue('');
    setAccountMask('');
    setReportedAt('');
    setShowAddTradeline(false);
    setNotice('Tradeline added. Run the consistency review when the report fields are entered.');
  };

  const runMetro2Review = () => {
    if (tradelines.length === 0) {
      setNotice('Add at least one tradeline or import report data before running a review.');
      return;
    }

    const stamp = Date.now();
    const seen = new Map<string, number>();
    tradelines.forEach((record) => {
      const key = `${record.bureau}|${record.furnisherName.toLowerCase()}|${record.accountMask || ''}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    });

    const nextReviews = tradelines.map((record, index) => {
      const issues = buildReviewIssues(record);
      const duplicateKey = `${record.bureau}|${record.furnisherName.toLowerCase()}|${record.accountMask || ''}`;
      if ((seen.get(duplicateKey) || 0) > 1) {
        issues.push('duplicate_reporting');
      }
      const uniqueIssues = Array.from(new Set(issues));
      return {
        id: `credit-review-${stamp}-${index}`,
        tradelineId: record.id,
        entityId: activeEntityId || record.entityId,
        reviewedAt: new Date().toISOString(),
        reviewType: 'metro2_consistency' as const,
        status: uniqueIssues.length ? ('review' as const) : ('clean' as const),
        issueTypes: uniqueIssues,
        factualBasis: uniqueIssues.length
          ? 'Potential inconsistency detected from report fields. Verify against statements, agreements, payment records, and bureau/furnisher data before disputing.'
          : undefined,
        reviewSummary: uniqueIssues.length
          ? `${uniqueIssues.length} field-level issue${uniqueIssues.length === 1 ? '' : 's'} flagged for factual verification.`
          : 'No obvious field-level inconsistency was detected in the entered data.',
        bureauDisputeStatus: 'not_started' as const,
        furnisherDisputeStatus: 'not_started' as const,
      };
    });

    setData((prev) => ({
      ...prev,
      creditReviews: [
        ...nextReviews,
        ...(prev.creditReviews ?? []).filter(
          (item) => !nextReviews.some((next) => next.tradelineId === item.tradelineId),
        ),
      ],
    }));
    setNotice(
      'Review complete. Flags are verification prompts, not automatic disputes or a claim that the furnisher reported incorrectly.',
    );
  };

  const buildPlan = () => {
    const stamp = Date.now();
    const actions: Array<{
      id: string;
      label: string;
      status: 'todo' | 'doing' | 'done' | 'skipped';
      notes?: string;
    }> = [];

    const highUtilization = revolving.filter((item) => (utilization(item) || 0) > 30);
    highUtilization.forEach((item, index) => {
      actions.push({
        id: `plan-util-${stamp}-${index}`,
        label: `Lower revolving utilization on ${item.furnisherName}`,
        status: 'todo',
        notes:
          'Reduce reported revolving balance if financially appropriate. ClearFlow does not predict a score change.',
      });
    });

    if (tradelines.some((item) => item.paymentStatus !== 'current')) {
      actions.push({
        id: `plan-history-${stamp}`,
        label: 'Bring confirmed current obligations up to date where possible',
        status: 'todo',
        notes:
          'Use actual creditor statements and settlement records; do not dispute accurate late history merely to seek deletion.',
      });
    }

    if (reviews.some((item) => item.status === 'review')) {
      actions.push({
        id: `plan-review-${stamp}`,
        label: 'Verify flagged report fields and prepare factual disputes where supported',
        status: 'todo',
        notes:
          'Attach source evidence before sending a bureau or furnisher dispute.',
      });
    }

    if (actions.length === 0) {
      actions.push({
        id: `plan-monitor-${stamp}`,
        label: 'Maintain on-time payments and review new report updates',
        status: 'todo',
        notes: 'Recheck utilization, balances, and reporting accuracy after the next reporting cycle.',
      });
    }

    setData((prev) => ({
      ...prev,
      creditBuildPlans: [
        {
          id: `credit-plan-${stamp}`,
          entityId: activeEntityId || undefined,
          profileType,
          createdAt: new Date().toISOString(),
          status: 'active',
          targetUtilizationPercent: 30,
          actions,
          notes:
            'Action plan based on entered report data. It does not forecast a credit score or promise deletion of accurate information.',
        },
        ...(prev.creditBuildPlans ?? []).map((item) =>
          item.profileType === profileType &&
          (!activeEntityId || item.entityId === activeEntityId) &&
          item.status === 'active'
            ? { ...item, status: 'archived' as const }
            : item,
        ),
      ],
    }));
    setNotice('A new credit-building action plan was created from the current report data.');
  };

  const markDisputeReady = (reviewId: string) => {
    setData((prev) => ({
      ...prev,
      creditReviews: prev.creditReviews.map((item) =>
        item.id === reviewId
          ? {
              ...item,
              status: 'dispute_ready',
              bureauDisputeStatus: 'draft',
              furnisherDisputeStatus: 'draft',
            }
          : item,
      ),
    }));
    setNotice('Marked dispute-ready. Attach evidence and verify the factual basis before sending.');
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 850 }}>Credit Building</div>
          <div style={{ color: 'var(--cf-muted)', fontSize: 13, marginTop: 5 }}>
            Report accuracy, utilization, payment history, factual disputes, and Metro 2-oriented consistency review.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setShowAddTradeline(true)} style={buttonStyle(true)}>
            + Tradeline
          </button>
          <button type="button" onClick={runMetro2Review} style={buttonStyle(true)}>
            Run Metro 2 Review
          </button>
          <button type="button" onClick={buildPlan} style={buttonStyle()}>
            Build Plan
          </button>
          <button type="button" onClick={() => navigate('#documents:upload')} style={buttonStyle()}>
            Upload Report
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['personal', 'business'] as CreditProfileType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setProfileType(type)}
            style={buttonStyle(profileType === type)}
          >
            {type === 'personal' ? 'Personal Credit' : 'Business Credit'}
          </button>
        ))}
      </div>

      {notice ? (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid rgba(45,212,191,0.25)',
            background: 'rgba(15,118,110,0.15)',
            color: '#d1fae5',
            fontSize: 13,
          }}
        >
          {notice}
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(145px,1fr))',
          gap: 10,
        }}
      >
        <div style={cardStyle}>
          <div style={{ color: 'var(--cf-muted)', fontSize: 11 }}>TRADELINES</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{tradelines.length}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: 'var(--cf-muted)', fontSize: 11 }}>CURRENT</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{currentCount}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: 'var(--cf-muted)', fontSize: 11 }}>REVOLVING BALANCE</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{formatMoney(totalBalance)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: 'var(--cf-muted)', fontSize: 11 }}>UTILIZATION</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {aggregateUtilization === null ? '—' : `${aggregateUtilization.toFixed(0)}%`}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: 'var(--cf-muted)', fontSize: 11 }}>REVIEW ITEMS</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{reviewCount}</div>
        </div>
      </div>

      {showAddTradeline ? (
        <PageSection title="Add Tradeline">
          <div style={{ display: 'grid', gap: 10 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(190px,1fr))',
                gap: 10,
              }}
            >
              <input
                value={furnisherName}
                onChange={(event) => setFurnisherName(event.target.value)}
                placeholder="Furnisher / creditor"
                style={inputStyle}
              />
              <select value={bureau} onChange={(event) => setBureau(event.target.value as CreditBureauName)} style={inputStyle}>
                <option value="experian">Experian</option>
                <option value="equifax">Equifax</option>
                <option value="transunion">TransUnion</option>
                <option value="other">Other</option>
              </select>
              <select value={accountType} onChange={(event) => setAccountType(event.target.value as CreditTradelineRecord['accountType'])} style={inputStyle}>
                <option value="revolving">Revolving</option>
                <option value="installment">Installment</option>
                <option value="mortgage">Mortgage</option>
                <option value="auto">Auto</option>
                <option value="student">Student</option>
                <option value="collection">Collection</option>
                <option value="utility">Utility</option>
                <option value="other">Other</option>
              </select>
              <select value={status} onChange={(event) => setStatus(event.target.value as CreditTradelineRecord['status'])} style={inputStyle}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="collection">Collection</option>
                <option value="charged_off">Charged off</option>
                <option value="other">Other</option>
              </select>
              <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as CreditTradelineRecord['paymentStatus'])} style={inputStyle}>
                <option value="current">Current</option>
                <option value="30_days">30 days late</option>
                <option value="60_days">60 days late</option>
                <option value="90_days">90 days late</option>
                <option value="120_plus">120+ days late</option>
                <option value="collection">Collection</option>
                <option value="charge_off">Charge off</option>
                <option value="unknown">Unknown</option>
              </select>
              <input value={accountMask} onChange={(event) => setAccountMask(event.target.value)} placeholder="Account last 4 / mask" style={inputStyle} />
              <input type="number" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="Balance" style={inputStyle} />
              <input type="number" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} placeholder="Credit limit (if revolving)" style={inputStyle} />
              <input type="number" value={pastDue} onChange={(event) => setPastDue(event.target.value)} placeholder="Past due amount" style={inputStyle} />
              <input type="date" value={reportedAt} onChange={(event) => setReportedAt(event.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={addTradeline} style={buttonStyle(true)}>
                Save Tradeline
              </button>
              <button type="button" onClick={() => setShowAddTradeline(false)} style={buttonStyle()}>
                Cancel
              </button>
            </div>
          </div>
        </PageSection>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))',
          gap: 12,
        }}
      >
        <PageSection title="Tradelines">
          <div style={{ display: 'grid', gap: 8 }}>
            {tradelines.length === 0 ? (
              <div style={{ color: 'var(--cf-muted)', fontSize: 13 }}>
                Add report data manually or upload a credit report into Documents.
              </div>
            ) : (
              tradelines.slice(0, 12).map((record) => {
                const recordUtil = utilization(record);
                return (
                  <div key={record.id} style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{record.furnisherName}</strong>
                      <span style={{ color: 'var(--cf-muted)', fontSize: 12 }}>
                        {record.bureau}
                      </span>
                    </div>
                    <div style={{ color: 'var(--cf-muted)', fontSize: 12, marginTop: 5 }}>
                      {record.accountType.replaceAll('_', ' ')} · {record.status} · {record.paymentStatus.replaceAll('_', ' ')}
                    </div>
                    <div style={{ marginTop: 7, fontSize: 13 }}>
                      Balance {formatMoney(record.balance)}
                      {record.creditLimit ? ` / ${formatMoney(record.creditLimit)}` : ''}
                      {recordUtil !== null ? ` · ${recordUtil.toFixed(0)}% utilized` : ''}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </PageSection>

        <PageSection title="Metro 2 + AI Review">
          <div style={{ display: 'grid', gap: 8 }}>
            <div
              style={{
                ...cardStyle,
                color: 'var(--cf-muted)',
                fontSize: 12,
                lineHeight: 1.55,
              }}
            >
              Metro 2 is the industry reporting format used by furnishers. ClearFlow checks the report fields you enter for internal consistency and evidence gaps. It does not claim access to proprietary Metro 2 codes or automatically dispute accurate information.
            </div>
            {reviews.length === 0 ? (
              <button type="button" onClick={runMetro2Review} style={buttonStyle(true)}>
                Run First Review
              </button>
            ) : (
              reviews.slice(0, 10).map((review) => {
                const tradeline = data.creditTradelines.find((item) => item.id === review.tradelineId);
                return (
                  <div key={review.id} style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{tradeline?.furnisherName || 'Tradeline review'}</strong>
                      <span style={{ fontSize: 12, color: review.status === 'clean' ? '#86efac' : '#fde68a' }}>
                        {review.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <div style={{ color: 'var(--cf-muted)', fontSize: 12, marginTop: 5 }}>
                      {review.reviewSummary}
                    </div>
                    {review.issueTypes.length > 0 ? (
                      <div style={{ fontSize: 12, marginTop: 7 }}>
                        Flags: {review.issueTypes.map((item) => item.replaceAll('_', ' ')).join(', ')}
                      </div>
                    ) : null}
                    {review.status === 'review' ? (
                      <button
                        type="button"
                        onClick={() => markDisputeReady(review.id)}
                        style={{ ...buttonStyle(), marginTop: 8 }}
                      >
                        Prepare Factual Dispute
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </PageSection>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))',
          gap: 12,
        }}
      >
        <PageSection title="Build Plan">
          <div style={{ display: 'grid', gap: 8 }}>
            {plans.length === 0 ? (
              <button type="button" onClick={buildPlan} style={buttonStyle(true)}>
                Create Action Plan
              </button>
            ) : (
              plans[0].actions.map((action) => (
                <div key={action.id} style={cardStyle}>
                  <div style={{ fontWeight: 700 }}>{action.label}</div>
                  {action.notes ? (
                    <div style={{ color: 'var(--cf-muted)', fontSize: 12, marginTop: 4 }}>
                      {action.notes}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </PageSection>

        <PageSection title="Client / Income Mode">
          <div style={{ display: 'grid', gap: 9, fontSize: 13 }}>
            <div style={{ ...cardStyle, color: 'var(--cf-muted)', lineHeight: 1.55 }}>
              The legitimate business opportunity is credit education, report analysis, documentation, and factual-dispute workflow — not guaranteed deletions or secret Metro 2 hacks. If ClearFlow is used to sell consumer credit-repair services, the service workflow should stay behind a compliance checklist for contracts, cancellation rights, fee timing, and advertising claims.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => navigate('#compliance')} style={buttonStyle()}>
                Open Compliance
              </button>
              <button type="button" onClick={() => navigate('#documents')} style={buttonStyle()}>
                Client Documents
              </button>
              <button type="button" onClick={() => navigate('#aiStudio')} style={buttonStyle()}>
                AI Studio
              </button>
            </div>
          </div>
        </PageSection>
      </div>
    </div>
  );
}
