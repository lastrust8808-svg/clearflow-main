import type { Dispatch, SetStateAction } from 'react';
import type { AutoReconcileStatus, CoreDataBundle } from '../../types/core';
import { buildSettlementFlowViews, formatMoney } from '../../services/settlementAnalytics.service';
import PageSection from '../ui/PageSection';
import RecordCard from '../ui/RecordCard';
import RecordEditorCard from '../ui/RecordEditorCard';
import StatCard from '../ui/StatCard';

interface TransactionsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

function statusPill(label: string, tone: 'blue' | 'teal' | 'gold' | 'rose') {
  const tones = {
    blue: {
      background: 'rgba(88, 141, 255, 0.18)',
      border: 'rgba(125, 163, 255, 0.24)',
      color: '#d9e6ff',
    },
    teal: {
      background: 'rgba(54, 215, 255, 0.18)',
      border: 'rgba(126, 242, 255, 0.24)',
      color: '#ddfbff',
    },
    gold: {
      background: 'rgba(247, 211, 123, 0.14)',
      border: 'rgba(247, 211, 123, 0.26)',
      color: '#fff2cc',
    },
    rose: {
      background: 'rgba(255, 120, 160, 0.18)',
      border: 'rgba(255, 160, 195, 0.24)',
      color: '#ffe1eb',
    },
  } satisfies Record<string, { background: string; border: string; color: string }>;

  const toneStyle = tones[tone];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '6px 10px',
        borderRadius: 999,
        border: `1px solid ${toneStyle.border}`,
        background: toneStyle.background,
        color: toneStyle.color,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </span>
  );
}

function autoStatusTone(status: AutoReconcileStatus) {
  switch (status) {
    case 'matched':
      return 'teal';
    case 'partial':
      return 'gold';
    case 'exception':
      return 'rose';
    default:
      return 'blue';
  }
}

function settlementTone(status?: CoreDataBundle['settlements'][number]['status']) {
  switch (status) {
    case 'settled':
      return 'teal';
    case 'exception':
      return 'rose';
    case 'verifying':
    case 'clearing':
      return 'gold';
    default:
      return 'blue';
  }
}

export default function TransactionsPage({ data, setData }: TransactionsPageProps) {
  const settlementFlows = buildSettlementFlowViews(data);
  const entityNameById = new Map(data.entities.map((entity) => [entity.id, entity.name]));
  const coveredTransactions = settlementFlows.filter((flow) => flow.settlement).length;
  const liquidCashReadyCount = settlementFlows.filter((flow) => flow.liquidCashReady).length;
  const verifiedCount = settlementFlows.filter((flow) => flow.verificationReady).length;
  const autoMatchedCount = settlementFlows.filter(
    (flow) => flow.derivedAutoReconcileStatus === 'matched'
  ).length;
  const interEntityMoveCount = data.interEntityTransfers.length * 2;
  const exceptionCount = settlementFlows.filter(
    (flow) =>
      flow.hasCoverageGap ||
      flow.derivedAutoReconcileStatus === 'exception' ||
      flow.settlement?.status === 'exception'
  ).length;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Transactions</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Every transaction now sits in a settlement flow: route to liquid cash, verify the credit
          or debit, and tie the journal layer back automatically.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Transactions" value={data.transactions.length} />
        <StatCard label="Settlement Coverage" value={coveredTransactions} />
        <StatCard label="Liquid Cash Ready" value={liquidCashReadyCount} />
        <StatCard label="Verified Credits / Debits" value={verifiedCount} />
        <StatCard label="Inter-Entity Halves" value={interEntityMoveCount} />
        <StatCard label="Auto Reconciled" value={autoMatchedCount} subvalue={`${exceptionCount} need attention`} />
      </div>

      <PageSection
        title="Settlement Control Center"
        description="Track how every transaction becomes liquid cash or a verified tokenized movement, and whether the journals actually tie out."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {settlementFlows.map((flow) => (
            <RecordCard
              key={flow.transaction.id}
              title={flow.transaction.title}
              subtitle={`${flow.transaction.type} · ${flow.transaction.status} · ${flow.transaction.date}`}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {statusPill(
                    flow.settlement
                      ? `Settlement: ${flow.settlement.status}`
                      : 'Settlement missing',
                    flow.settlement ? settlementTone(flow.settlement.status) : 'rose'
                  )}
                  {statusPill(
                    `Auto reconcile: ${flow.derivedAutoReconcileStatus}`,
                    autoStatusTone(flow.derivedAutoReconcileStatus)
                  )}
                  {statusPill(
                    flow.verificationReady ? 'Verified' : 'Verification pending',
                    flow.verificationReady ? 'teal' : 'gold'
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 10,
                    color: 'var(--cf-muted)',
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1 }}>
                      Transaction Amount
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--cf-text)', fontWeight: 700 }}>
                      {formatMoney(flow.transaction.amount, flow.transaction.currency)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1 }}>
                      Liquid Cash Stage
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--cf-text)', fontWeight: 700 }}>
                      {flow.settlement?.liquidCashStage ?? 'unassigned'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1 }}>
                      Settlement Path
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--cf-text)', fontWeight: 700 }}>
                      {flow.settlement?.path ?? 'not linked'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1 }}>
                      Verification Method
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--cf-text)', fontWeight: 700 }}>
                      {flow.settlement?.verificationMethod ?? 'not started'}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: 'var(--cf-muted)',
                    lineHeight: 1.6,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Journal tie-out:</strong>{' '}
                    {formatMoney(flow.journalAmount, flow.transaction.currency)} posted across{' '}
                    {flow.journalEntries.length} entries
                    {flow.journalDelta === 0
                      ? ' with no delta.'
                      : ` with a ${formatMoney(Math.abs(flow.journalDelta), flow.transaction.currency)} delta.`}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Payment / proof:</strong>{' '}
                    {flow.payment
                      ? `${flow.payment.method} ${flow.payment.status}`
                      : flow.onChainRecord
                        ? `${flow.onChainRecord.network} ${flow.onChainRecord.status}`
                        : 'No payment or on-chain proof linked yet.'}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Reconciliation:</strong>{' '}
                    {flow.reconciliation
                      ? `${flow.reconciliation.status}${flow.clearedInReconciliation ? ' and transaction cleared.' : ' but transaction not cleared yet.'}`
                      : 'No bank or statement reconciliation linked yet.'}
                  </div>
                  {flow.interEntityTransfer ? (
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Inter-entity rule:</strong>{' '}
                      {flow.interEntityTransfer.settlementMode === 'mirrored_halves'
                        ? `Mirrored half only. ${entityNameById.get(flow.interEntityTransfer.fromEntityId)} and ${entityNameById.get(flow.interEntityTransfer.toEntityId)} each keep their own ledger side.`
                        : 'Cross-entity clearing is explicitly enabled for this movement.'}
                    </div>
                  ) : null}
                  {flow.settlement?.tokenizedProofId ? (
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Tokenized proof:</strong>{' '}
                      {flow.settlement.tokenizedProofId}
                    </div>
                  ) : null}
                  {flow.settlement?.verificationReference ? (
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Control note:</strong>{' '}
                      {flow.settlement.verificationReference}
                    </div>
                  ) : null}
                </div>
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Inter-Entity Transfer Ledger"
        description="Linked entity-to-entity movements are mirrored as paired halves, not one blended reconciliation, unless cross-clearing is explicitly designated."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.interEntityTransfers.map((transfer) => (
            <RecordCard
              key={transfer.id}
              title={`${entityNameById.get(transfer.fromEntityId)} → ${entityNameById.get(transfer.toEntityId)}`}
              subtitle={`${transfer.settlementMode} · ${transfer.status} · ${transfer.effectiveDate}`}
            >
              <div style={{ display: 'grid', gap: 10, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Amount:</strong>{' '}
                  {formatMoney(transfer.amount, transfer.currency)}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Origin half:</strong> {transfer.fromTransactionId}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Destination half:</strong>{' '}
                  {transfer.toTransactionId}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Control rule:</strong>{' '}
                  {transfer.settlementMode === 'mirrored_halves'
                    ? 'Each entity reconciles only its own side of the move.'
                    : 'This transfer is allowed to clear across both entities.'}
                </div>
                {transfer.memo ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Memo:</strong> {transfer.memo}
                  </div>
                ) : null}
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Settlement Records"
        description="Editable settlement-control records driving liquid-cash routing, verification, and tie-out status."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.settlements.map((settlement) => (
            <div key={settlement.id}>
              <RecordEditorCard
                title={`${settlement.path} settlement`}
                subtitle={`${settlement.status} · ${settlement.liquidCashStage} · ${formatMoney(settlement.settledAmount, settlement.currency)}`}
                record={settlement}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    settlements: prev.settlements.map((item) =>
                      item.id === settlement.id ? nextRecord : item
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection title="Ledger-Linked Transactions" description="Editable transaction records.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.transactions.map((tx) => (
            <div key={tx.id}>
              <RecordEditorCard
                title={tx.title}
                subtitle={`${tx.type} · ${tx.status} · ${tx.date}`}
                record={tx}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    transactions: prev.transactions.map((item) =>
                      item.id === tx.id ? nextRecord : item
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection title="On-Chain Events" description="Editable on-chain event records.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.onChainTransactions.map((tx) => (
            <div key={tx.id}>
              <RecordEditorCard
                title={tx.eventType}
                subtitle={`${tx.network} · ${tx.status}`}
                record={tx}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    onChainTransactions: prev.onChainTransactions.map((item) =>
                      item.id === tx.id ? nextRecord : item
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
