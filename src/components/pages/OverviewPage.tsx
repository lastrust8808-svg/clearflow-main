import { useMemo } from 'react';
import type { CoreDataBundle } from '../../types/core';
import type { User } from '../../types/app.models';
import PageSection from '../ui/PageSection';

interface OverviewPageProps {
  data: CoreDataBundle;
  currentUser?: User | null;
  activeEntityId?: string | null;
  onSelectActiveEntity?: (entityId: string | null) => void;
  hasDriveAccess?: boolean;
}

function formatMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

const actionStyle = (primary = false): React.CSSProperties => ({
  minHeight: 44,
  borderRadius: 12,
  border: primary
    ? '1px solid rgba(126,242,255,0.34)'
    : '1px solid var(--cf-border)',
  background: primary
    ? 'linear-gradient(135deg, rgba(54,215,255,0.16), rgba(37,99,235,0.16))'
    : 'rgba(255,255,255,0.035)',
  color: primary ? 'var(--cf-accent-soft)' : 'var(--cf-text)',
  cursor: 'pointer',
  fontWeight: 750,
  padding: '10px 14px',
  textAlign: 'left',
});

const metricStyle: React.CSSProperties = {
  minWidth: 0,
  padding: '12px 14px',
  borderRadius: 14,
  border: '1px solid var(--cf-border)',
  background: 'rgba(255,255,255,0.025)',
  display: 'grid',
  gap: 4,
};

export default function OverviewPage({
  data,
  currentUser,
  activeEntityId,
  onSelectActiveEntity,
  hasDriveAccess = false,
}: OverviewPageProps) {
  const navigate = (hash: string) => {
    if (typeof window !== 'undefined') {
      window.location.hash = hash;
    }
  };

  const activeEntity = activeEntityId
    ? data.entities.find((entity) => entity.id === activeEntityId) || null
    : null;

  const scoped = useMemo(() => {
    const match = <T extends { entityId?: string }>(records: T[]) =>
      activeEntityId ? records.filter((item) => item.entityId === activeEntityId) : records;

    return {
      bills: match(data.bills),
      invoices: match(data.invoices),
      payments: match(data.payments),
      assets: match(data.assets),
      documents: match(data.documents),
      settlements: match(data.settlements),
      complianceTags: match(data.complianceTags),
      reconciliations: match(data.reconciliations),
      bankAccounts: match(data.bankAccounts),
      obligations: match(data.obligations),
    };
  }, [activeEntityId, data]);

  const openBillAmount = scoped.bills
    .filter((bill) => bill.balanceDue > 0 && bill.status !== 'void')
    .reduce((sum, bill) => sum + Number(bill.balanceDue || 0), 0);
  const openInvoiceAmount = scoped.invoices
    .filter((invoice) => invoice.balanceDue > 0 && invoice.status !== 'void')
    .reduce((sum, invoice) => sum + Number(invoice.balanceDue || 0), 0);
  const pendingPayments = scoped.payments.filter(
    (payment) => payment.status !== 'settled' && payment.status !== 'failed',
  );
  const reviewCount =
    scoped.complianceTags.filter((item) => item.status === 'review').length +
    scoped.settlements.filter(
      (item) =>
        item.status === 'exception' ||
        item.verificationStatus === 'exception' ||
        item.requiresManualReview,
    ).length +
    scoped.reconciliations.filter((item) => item.status !== 'completed').length;
  const assetValue = scoped.assets.reduce(
    (sum, asset) => sum + Number(asset.marketValue ?? asset.bookValue ?? 0),
    0,
  );

  const attentionItems = [
    openBillAmount > 0
      ? {
          title: `${formatMoney(openBillAmount)} in open bills`,
          action: 'Review bills',
          hash: '#accounting:bills',
        }
      : null,
    pendingPayments.length > 0
      ? {
          title: `${pendingPayments.length} payment${pendingPayments.length === 1 ? '' : 's'} awaiting completion`,
          action: 'Open remittance desk',
          hash: '#accounting:payments',
        }
      : null,
    reviewCount > 0
      ? {
          title: `${reviewCount} review item${reviewCount === 1 ? '' : 's'} need attention`,
          action: 'Open controls',
          hash: '#compliance',
        }
      : null,
    scoped.bankAccounts.length === 0
      ? {
          title: 'No bank account connected to this view',
          action: 'Open bank feed',
          hash: '#accounting:bankFeed',
        }
      : null,
  ].filter(
    (item): item is { title: string; action: string; hash: string } => Boolean(item),
  );

  const recentActivity = [
    ...scoped.payments.map((item) => ({
      id: `payment-${item.id}`,
      date: item.paymentDate,
      label: item.direction === 'incoming' ? 'Incoming payment' : 'Outgoing payment',
      detail: `${formatMoney(item.amount, item.currency)} · ${item.status}`,
      hash: '#accounting:payments',
    })),
    ...scoped.bills.map((item) => ({
      id: `bill-${item.id}`,
      date: item.issueDate,
      label: `Bill ${item.billNumber || ''}`.trim(),
      detail: `${formatMoney(item.balanceDue, item.currency)} due · ${item.status}`,
      hash: '#accounting:bills',
    })),
    ...scoped.settlements.map((item) => ({
      id: `settlement-${item.id}`,
      date: item.actualSettlementDate || item.initiatedAt,
      label: 'Settlement',
      detail: `${formatMoney(item.grossAmount, item.currency)} · ${item.status}`,
      hash: '#transactions',
    })),
  ]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 5);

  const deskGroups = [
    {
      title: 'Money',
      actions: [
        ['Bills', '#accounting:bills'],
        ['Invoices', '#accounting:invoices'],
        ['Payments', '#accounting:payments'],
        ['Bank Feed', '#accounting:bankFeed'],
        ['Reconcile', '#accounting:reconciliation'],
      ],
    },
    {
      title: 'Value',
      actions: [
        ['Assets & Reserve', '#assets'],
        ['Ledger & Treasury', '#ledger'],
        ['Intercompany', '#accounting:intercompany'],
        ['Transactions', '#transactions'],
      ],
    },
    {
      title: 'Records & Control',
      actions: [
        ['Documents', '#documents'],
        ['Compliance', '#compliance'],
        ['Entities', '#entities'],
        ['Settings', '#settings'],
      ],
    },
  ] as const;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 850, lineHeight: 1.15 }}>Command Center</div>
          <div style={{ marginTop: 5, color: 'var(--cf-muted)', fontSize: 13 }}>
            {activeEntity
              ? activeEntity.displayName || activeEntity.name
              : 'Collective workspace'}
            {currentUser?.email ? ` · ${currentUser.email}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => navigate('#accounting:new-bill')} style={actionStyle(true)}>
            + Bill
          </button>
          <button type="button" onClick={() => navigate('#accounting:new-payment')} style={actionStyle(true)}>
            + Payment
          </button>
          <button type="button" onClick={() => navigate('#documents:upload')} style={actionStyle()}>
            + Document
          </button>
          <button type="button" onClick={() => navigate('#accounting:new-intercompany')} style={actionStyle()}>
            + Intercompany
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
          gap: 10,
        }}
      >
        <div style={metricStyle}>
          <span style={{ color: 'var(--cf-muted)', fontSize: 11 }}>OPEN BILLS</span>
          <strong style={{ fontSize: 20 }}>{formatMoney(openBillAmount)}</strong>
        </div>
        <div style={metricStyle}>
          <span style={{ color: 'var(--cf-muted)', fontSize: 11 }}>OPEN INVOICES</span>
          <strong style={{ fontSize: 20 }}>{formatMoney(openInvoiceAmount)}</strong>
        </div>
        <div style={metricStyle}>
          <span style={{ color: 'var(--cf-muted)', fontSize: 11 }}>PENDING PAYMENTS</span>
          <strong style={{ fontSize: 20 }}>{pendingPayments.length}</strong>
        </div>
        <div style={metricStyle}>
          <span style={{ color: 'var(--cf-muted)', fontSize: 11 }}>ASSET VALUE</span>
          <strong style={{ fontSize: 20 }}>{formatMoney(assetValue)}</strong>
        </div>
        <div style={metricStyle}>
          <span style={{ color: 'var(--cf-muted)', fontSize: 11 }}>REVIEW</span>
          <strong style={{ fontSize: 20 }}>{reviewCount}</strong>
        </div>
      </div>

      {attentionItems.length > 0 ? (
        <PageSection title="Needs Attention">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
            }}
          >
            {attentionItems.slice(0, 4).map((item) => (
              <button
                key={item.hash}
                type="button"
                onClick={() => navigate(item.hash)}
                style={{
                  ...actionStyle(),
                  display: 'grid',
                  gap: 7,
                }}
              >
                <span>{item.title}</span>
                <span style={{ color: 'var(--cf-accent-soft)', fontSize: 12 }}>
                  {item.action} →
                </span>
              </button>
            ))}
          </div>
        </PageSection>
      ) : null}

      <PageSection title="Work Areas">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 12,
          }}
        >
          {deskGroups.map((group) => (
            <div
              key={group.title}
              style={{
                border: '1px solid var(--cf-border)',
                borderRadius: 14,
                padding: 12,
                background: 'rgba(255,255,255,0.02)',
                display: 'grid',
                gap: 9,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--cf-muted)',
                  fontWeight: 800,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                }}
              >
                {group.title}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {group.actions.map(([label, hash]) => (
                  <button
                    key={hash}
                    type="button"
                    onClick={() => navigate(hash)}
                    style={{
                      ...actionStyle(),
                      minHeight: 40,
                      padding: '8px 10px',
                      fontSize: 13,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PageSection>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        <PageSection title="Active Board">
          <div style={{ display: 'grid', gap: 10 }}>
            <select
              value={activeEntityId || ''}
              onChange={(event) => onSelectActiveEntity?.(event.target.value || null)}
              style={{
                width: '100%',
                minHeight: 44,
                borderRadius: 12,
                border: '1px solid var(--cf-border)',
                background: 'rgba(10,16,28,0.72)',
                color: 'var(--cf-text)',
                padding: '0 12px',
              }}
            >
              <option value="">Collective workspace</option>
              {data.entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.displayName || entity.name}
                </option>
              ))}
            </select>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
                gap: 8,
              }}
            >
              <div style={metricStyle}>
                <span style={{ color: 'var(--cf-muted)', fontSize: 10 }}>DOCS</span>
                <strong>{scoped.documents.length}</strong>
              </div>
              <div style={metricStyle}>
                <span style={{ color: 'var(--cf-muted)', fontSize: 10 }}>ASSETS</span>
                <strong>{scoped.assets.length}</strong>
              </div>
              <div style={metricStyle}>
                <span style={{ color: 'var(--cf-muted)', fontSize: 10 }}>OBLIGATIONS</span>
                <strong>{scoped.obligations.filter((item) => item.status === 'open').length}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => navigate('#entities')} style={actionStyle()}>
                Entity
              </button>
              <button type="button" onClick={() => navigate('#accounting:dashboard')} style={actionStyle()}>
                Accounting
              </button>
              <button type="button" onClick={() => navigate('#documents')} style={actionStyle()}>
                Documents
              </button>
              {!hasDriveAccess ? (
                <button type="button" onClick={() => navigate('#settings')} style={actionStyle()}>
                  Connect storage
                </button>
              ) : null}
            </div>
          </div>
        </PageSection>

        <PageSection title="Recent Activity">
          <div style={{ display: 'grid', gap: 8 }}>
            {recentActivity.length > 0 ? (
              recentActivity.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.hash)}
                  style={{
                    ...actionStyle(),
                    display: 'grid',
                    gap: 3,
                    minHeight: 0,
                  }}
                >
                  <span>{item.label}</span>
                  <span style={{ color: 'var(--cf-muted)', fontSize: 12 }}>
                    {item.detail}
                  </span>
                </button>
              ))
            ) : (
              <div style={{ color: 'var(--cf-muted)', fontSize: 13 }}>
                No recent activity yet.
              </div>
            )}
          </div>
        </PageSection>
      </div>
    </div>
  );
}
