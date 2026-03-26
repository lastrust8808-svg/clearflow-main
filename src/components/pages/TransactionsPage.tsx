import type { Dispatch, SetStateAction } from 'react';
import type { AutoReconcileStatus, CoreDataBundle } from '../../types/core';
import { buildSettlementFlowViews, formatMoney } from '../../services/settlementAnalytics.service';
import {
  buildObligationLifecycleSummaries,
  type ObligationLifecycleSummary,
} from '../../services/obligationLifecycle.service';
import { buildTransactionProofChainViews } from '../../services/transactionProofChain.service';
import PageSection from '../ui/PageSection';
import RecordCard from '../ui/RecordCard';
import RecordEditorCard from '../ui/RecordEditorCard';
import StatCard from '../ui/StatCard';

interface TransactionsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

function goToHash(hash: string) {
  if (typeof window !== 'undefined') {
    window.location.hash = hash;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToIsoDate(date: string, days: number) {
  const base = new Date(`${date}T00:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
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
  const registerCount = data.negotiableInstrumentRegisters.length;
  const holderLedgerCount = data.holderLedgerEntries.length;
  const exceptionCount = settlementFlows.filter(
    (flow) =>
      flow.hasCoverageGap ||
      flow.derivedAutoReconcileStatus === 'exception' ||
      flow.settlement?.status === 'exception'
  ).length;
  const obligationLifecycleSummaries = buildObligationLifecycleSummaries(data);
  const transactionProofChains = buildTransactionProofChainViews(data);
  const defaultedObligationCount = obligationLifecycleSummaries.filter(
    (item) => item.stage === 'defaulted'
  ).length;
  const dischargedObligationCount = obligationLifecycleSummaries.filter(
    (item) => item.stage === 'discharged'
  ).length;
  const sealedProofChainCount = transactionProofChains.filter(
    (item) => item.verificationStatus === 'sealed'
  ).length;

  const handleStartCure = (obligationId: string) => {
    const now = todayIso();
    const cureDeadline = addDaysToIsoDate(now, 10);
    setData((prev) => {
      const obligation = prev.obligations.find((item) => item.id === obligationId);
      if (!obligation) {
        return prev;
      }

      const tagId = `cmp-cure-${Date.now()}`;
      return {
        ...prev,
        obligations: prev.obligations.map((item) =>
          item.id === obligationId
            ? {
                ...item,
                lifecycleStage: 'cure_running',
                cureDeadline,
                enforcementMemo:
                  item.enforcementMemo ||
                  'Cure period opened after presentment to track controlled performance before default.',
              }
            : item
        ),
        complianceTags: [
          {
            id: tagId,
            entityId: obligation.entityId,
            label: `Cure running - ${obligation.title}`,
            category: 'risk',
            status: 'review',
            dueDate: cureDeadline,
            notes:
              'Internal default-control tracking only. Monitor cure period and evidence of performance or discharge.',
          },
          ...prev.complianceTags,
        ],
      };
    });
  };

  const handleDeclareDefault = (summary: ObligationLifecycleSummary) => {
    const now = todayIso();
    const defaultNoticeId = `doc-default-${Date.now()}`;
    const complianceTagId = `cmp-default-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      obligations: prev.obligations.map((item) =>
        item.id === summary.obligation.id
          ? {
              ...item,
              status: 'defaulted',
              lifecycleStage: 'defaulted',
              defaultBasis: item.defaultBasis || 'non_performance',
              defaultDeclaredAt: now,
              defaultNoticeDocumentId: defaultNoticeId,
              enforcementMemo:
                item.enforcementMemo ||
                'Default declared inside controlled private-ledger workflow pending review of governing documents and any outside enforcement rights.',
            }
          : item
      ),
      instrumentSettlements: prev.instrumentSettlements.map((item) =>
        item.obligationId === summary.obligation.id && item.performanceStatus !== 'performed'
          ? {
              ...item,
              performanceStatus: 'disputed',
              notes:
                item.notes ||
                'Moved to disputed status after internal default declaration review.',
            }
          : item
      ),
      settlements: prev.settlements.map((item) =>
        summary.obligation.linkedSettlementIds?.includes(item.id) ||
        item.linkedInstrumentSettlementId === summary.linkedInstrumentSettlement?.id
          ? {
              ...item,
              status: item.status === 'settled' ? item.status : 'exception',
              processorStatus:
                item.status === 'settled' ? item.processorStatus : 'requires_review',
              executionReason:
                item.executionReason ||
                'Internal default review opened before discharge could be completed.',
              notes:
                item.notes ||
                'Settlement placed into exception posture pending default review.',
            }
          : item
      ),
      negotiableInstrumentRegisters: prev.negotiableInstrumentRegisters.map((item) =>
        item.obligationId === summary.obligation.id ||
        summary.obligation.linkedInstrumentIds?.includes(item.instrumentId || '')
          ? {
              ...item,
              status: item.status === 'performed' ? item.status : 'disputed',
              notes:
                item.notes ||
                'Register flagged for default review pending cure or documented discharge.',
            }
          : item
      ),
      documents: [
        {
          id: defaultNoticeId,
          entityId: summary.obligation.entityId,
          title: `Notice of Default - ${summary.obligation.title}`,
          category: 'legal_memo',
          date: now,
          status: 'final',
          outputStatus: 'ready',
          generatedBody: `DEFAULT NOTICE\n\nObligation: ${summary.obligation.title}\nLegal Identifier: ${
            summary.obligation.legalIdentifier || 'Pending'
          }\nDeclared Date: ${now}\nBasis: ${
            summary.obligation.defaultBasis || 'non_performance'
          }\n\nThis record is an internal control notice for tracking default, cure failure, and follow-up. Review governing documents before any outside enforcement step.`,
          linkedInstrumentIds: summary.obligation.linkedInstrumentIds,
          summary: 'Internal default notice and review memo.',
          storageOwner: 'clearflow_retained',
          retentionClass: 'security_support',
          externalStorageStatus: 'not_applicable',
        },
        ...prev.documents,
      ],
      complianceTags: [
        {
          id: complianceTagId,
          entityId: summary.obligation.entityId,
          label: `Default review - ${summary.obligation.title}`,
          category: 'risk',
          status: 'restricted',
          linkedDocumentIds: [defaultNoticeId],
          notes:
            'Default recorded inside controlled settlement workflow. Review governing documents and any outside rail requirements before external action.',
        },
        ...prev.complianceTags,
      ],
    }));
  };

  const handleDischargeObligation = (summary: ObligationLifecycleSummary) => {
    const now = todayIso();
    const register = summary.linkedRegister;
    const performanceEntryId = `hle-discharge-${Date.now()}`;
    const proofTokenId = `tok-discharge-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      obligations: prev.obligations.map((item) =>
        item.id === summary.obligation.id
          ? {
              ...item,
              status: 'satisfied',
              lifecycleStage: 'discharged',
              dischargedAt: now,
              gainOrLossOnDischarge: item.gainOrLossOnDischarge ?? 0,
              enforcementMemo:
                item.enforcementMemo ||
                'Discharge completed and tied back to settlement, remittance, and holder-ledger evidence.',
            }
          : item
      ),
      settlements: prev.settlements.map((item) =>
        summary.obligation.linkedSettlementIds?.includes(item.id) ||
        item.id === summary.linkedSettlement?.id
          ? {
              ...item,
              status: 'settled',
              actualSettlementDate: item.actualSettlementDate || now,
              verificationStatus:
                item.verificationStatus === 'verified' ? item.verificationStatus : 'verified',
              processorStatus: item.processorStatus === 'blocked' ? 'settled' : item.processorStatus,
              releasedAt: item.releasedAt || new Date().toISOString(),
              liquidCashStage:
                item.liquidCashStage === 'liquid_cash_released'
                  ? item.liquidCashStage
                  : 'liquid_cash_released',
              tokenizedProofId: item.tokenizedProofId || proofTokenId,
              linkedTokenIds: Array.from(new Set([proofTokenId, ...(item.linkedTokenIds ?? [])])),
            }
          : item
      ),
      remittanceStatements: prev.remittanceStatements.map((item) =>
        summary.obligation.linkedRemittanceStatementIds?.includes(item.id) ||
        item.id === summary.linkedRemittanceStatement?.id
          ? {
              ...item,
              status: 'performed',
              notes: item.notes || 'Marked performed from default/discharge control desk.',
            }
          : item
      ),
      couponPresentments: prev.couponPresentments.map((item) =>
        summary.obligation.linkedCouponPresentmentIds?.includes(item.id) ||
        item.id === summary.linkedCouponPresentment?.id
          ? {
              ...item,
              status: 'performed',
              linkedTokenIds: Array.from(new Set([proofTokenId, ...(item.linkedTokenIds ?? [])])),
            }
          : item
      ),
      instrumentSettlements: prev.instrumentSettlements.map((item) =>
        item.obligationId === summary.obligation.id
          ? {
              ...item,
              performanceStatus: 'performed',
              performedAmount: Math.max(item.performedAmount, summary.obligation.amount),
              linkedTokenIds: Array.from(new Set([proofTokenId, ...(item.linkedTokenIds ?? [])])),
            }
          : item
      ),
      negotiableInstrumentRegisters: register
        ? prev.negotiableInstrumentRegisters.map((item) =>
            item.id === register.id
              ? {
                  ...item,
                  status: 'performed',
                  outstandingAmount: 0,
                  linkedTokenIds: Array.from(new Set([proofTokenId, ...(item.linkedTokenIds ?? [])])),
                }
              : item
          )
        : prev.negotiableInstrumentRegisters,
      holderLedgerEntries: register
        ? [
            {
              id: performanceEntryId,
              entityId: summary.obligation.entityId,
              registerId: register.id,
              entryDate: now,
              entryType: 'performance',
              holderEntityId: register.currentHolderEntityId,
              holderConnectionId: register.currentHolderConnectionId,
              holderLabel: register.currentHolderLabel || 'Current holder',
              amount: summary.outstandingAmount || summary.obligation.amount,
              currency: register.currency,
              resultingBalance: 0,
              linkedInstrumentId: register.instrumentId,
              linkedObligationId: summary.obligation.id,
              linkedSettlementId: summary.linkedSettlement?.id,
              linkedRemittanceStatementId: summary.linkedRemittanceStatement?.id,
              linkedTokenIds: [proofTokenId],
              notes: 'Discharge completed from transactions control desk.',
            },
            ...prev.holderLedgerEntries,
          ]
        : prev.holderLedgerEntries,
      tokens: [
        {
          id: proofTokenId,
          entityId: summary.obligation.entityId,
          subjectType: 'settlement',
          subjectId: summary.linkedSettlement?.id || summary.obligation.id,
          label: `Discharge Proof - ${summary.obligation.title}`,
          status: 'verified',
          tokenStandard: 'internal-proof',
          tokenReference: `DISC-${Date.now()}`,
          issuedAt: new Date().toISOString(),
          verifiedAt: new Date().toISOString(),
          proofReference:
            'Issued from the default and discharge desk after settlement, remittance, and holder-ledger tie-out.',
        },
        ...prev.tokens,
      ],
    }));
  };

  const resolveSettlementAction = (flow: (typeof settlementFlows)[number]) => {
    if (flow.transaction.linkedDocumentIds?.[0]) {
      return {
        label: 'Open Supporting Packet',
        hash: `#documents:${flow.transaction.linkedDocumentIds[0]}`,
      };
    }

    if (flow.settlement?.status === 'exception' || flow.derivedAutoReconcileStatus === 'exception') {
      return { label: 'Open Accounting Payments', hash: '#accounting:payments' };
    }

    if (flow.reconciliation) {
      return { label: 'Open Reconciliation', hash: '#accounting:reconciliation' };
    }

    return { label: 'Open Accounting', hash: '#accounting:dashboard' };
  };

  const resolveObligationAction = (obligation: CoreDataBundle['obligations'][number]) => {
    if (obligation.linkedDocumentIds?.[0]) {
      return { label: 'Open Packet', hash: `#documents:${obligation.linkedDocumentIds[0]}` };
    }

    if (obligation.recurringSchedule?.enabled) {
      return { label: 'Open Recurring Desk', hash: '#accounting:recurring' };
    }

    return { label: 'Open Accounting', hash: '#accounting:dashboard' };
  };

  const resolveRemittanceAction = (record: CoreDataBundle['remittanceStatements'][number]) => {
    if (record.linkedSettlementId) {
      return { label: 'Open Payments', hash: '#accounting:payments' };
    }

    if (record.linkedInstrumentSettlementId) {
      return { label: 'Open Instrument Desk', hash: '#transactions' };
    }

    return { label: 'Open Documents', hash: '#documents' };
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Transactions</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Every transaction now sits in a settlement flow: route to liquid cash, verify the credit
          or debit, tie the journal layer back automatically, and distinguish internal treasury
          discharge from bank-rail settlement.
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
        <StatCard label="N.I. Registers" value={registerCount} />
        <StatCard label="Holder Ledger Entries" value={holderLedgerCount} />
        <StatCard label="Sealed Proof Chains" value={sealedProofChainCount} />
        <StatCard label="Defaults" value={defaultedObligationCount} />
        <StatCard label="Discharged Obligations" value={dischargedObligationCount} />
        <StatCard label="Auto Reconciled" value={autoMatchedCount} subvalue={`${exceptionCount} need attention`} />
      </div>

      <PageSection
        title="Encrypted Proof Chains"
        description="Transactions are chained to their movement identifiers, settlements, payments, and verification tokens, then mirrored into the encrypted backend proof vault."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {transactionProofChains.map((chain) => (
            <RecordCard
              key={chain.chainId}
              title={chain.title}
              subtitle={`chain ${chain.chainIndex} · ${chain.verificationStatus} · ${chain.date}`}
            >
              <div style={{ display: 'grid', gap: 8, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Transaction / settlement:</strong>{' '}
                  {chain.transactionId} / {chain.settlementId || 'No settlement linked'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Previous chain:</strong>{' '}
                  {chain.previousChainId || 'Origin chain'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Payments / movement identifiers:</strong>{' '}
                  {chain.paymentIds.length} payment links / {chain.movementIdentifierIds.length} identifiers
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Verification tokens:</strong>{' '}
                  {chain.tokenIds.length ? chain.tokenIds.join(', ') : 'No verification tokens linked yet'}
                </div>
                {chain.watchReasons.length ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Watch reasons:</strong>{' '}
                    {chain.watchReasons.join(' | ')}
                  </div>
                ) : (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Watch reasons:</strong> Fully sealed
                    movement, settlement, identifier, and proof-token chain.
                  </div>
                )}
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Default & Discharge Control"
        description="Move obligations through presentment, cure, default review, and discharge with linked remittance, settlement, register, and holder-ledger evidence."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {obligationLifecycleSummaries.map((summary) => (
            <RecordCard
              key={summary.obligation.id}
              title={summary.obligation.title}
              subtitle={`${summary.stage} · ${summary.obligation.status} · ${formatMoney(summary.obligation.amount, 'USD')}`}
            >
              <div style={{ display: 'grid', gap: 12, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {statusPill(`Stage: ${summary.stage}`, summary.stage === 'defaulted' ? 'rose' : summary.stage === 'discharged' ? 'teal' : 'gold')}
                  {statusPill(`Presentments: ${summary.presentmentCount}`, summary.presentmentCount ? 'blue' : 'gold')}
                  {statusPill(
                    `Outstanding: ${formatMoney(summary.outstandingAmount, 'USD')}`,
                    summary.outstandingAmount === 0 ? 'teal' : 'gold'
                  )}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Legal identifier:</strong>{' '}
                  {summary.obligation.legalIdentifier || 'Not assigned'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Last presentment / cure:</strong>{' '}
                  {summary.obligation.lastPresentmentDate || 'Not presented'}{' '}
                  {summary.obligation.cureDeadline
                    ? `| cure deadline ${summary.obligation.cureDeadline}`
                    : ''}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Linked register / remittance:</strong>{' '}
                  {summary.linkedRegister?.registerLabel || 'No register'} /{' '}
                  {summary.linkedRemittanceStatement?.title || 'No remittance'}
                </div>
                {summary.watchItems.length ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Watch items:</strong>{' '}
                    {summary.watchItems.join(' | ')}
                  </div>
                ) : null}
                {summary.obligation.enforcementMemo ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Control memo:</strong>{' '}
                    {summary.obligation.enforcementMemo}
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {summary.canPresent ? (
                    <button
                      type="button"
                      onClick={() => goToHash('#accounting:new-presentment')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(126,242,255,0.28)',
                        background: 'rgba(54, 215, 255, 0.09)',
                        color: '#effcff',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Present / Re-Present
                    </button>
                  ) : null}
                  {summary.canStartCure ? (
                    <button
                      type="button"
                      onClick={() => handleStartCure(summary.obligation.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(247,211,123,0.28)',
                        background: 'rgba(247, 211, 123, 0.09)',
                        color: '#fff2cc',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Start Cure Window
                    </button>
                  ) : null}
                  {summary.canDeclareDefault ? (
                    <button
                      type="button"
                      onClick={() => handleDeclareDefault(summary)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,160,195,0.28)',
                        background: 'rgba(255, 120, 160, 0.09)',
                        color: '#ffe1eb',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Declare Default
                    </button>
                  ) : null}
                  {summary.canDischarge ? (
                    <button
                      type="button"
                      onClick={() => handleDischargeObligation(summary)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(140,235,191,0.28)',
                        background: 'rgba(80, 214, 156, 0.1)',
                        color: '#dcfff0',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Mark Discharged
                    </button>
                  ) : null}
                </div>
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Negotiable Instrument Register"
        description="Issued notes, bonds, futures, and collateral-backed instruments with legal identifiers, current holder, backing rail, and reserve support."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.negotiableInstrumentRegisters.map((record) => (
            <RecordCard
              key={record.id}
              title={record.registerLabel}
              subtitle={`${record.instrumentForm} · ${record.status} · ${record.legalIdentifier}`}
            >
              <div style={{ display: 'grid', gap: 8, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Current holder:</strong>{' '}
                  {record.currentHolderLabel || 'Not assigned'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Face / outstanding:</strong>{' '}
                  {formatMoney(record.faceAmount, record.currency)} /{' '}
                  {formatMoney(record.outstandingAmount, record.currency)}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Backing rail / treasury:</strong>{' '}
                  {record.backingCreditRailId || 'No rail linked'} /{' '}
                  {record.backingTreasuryAccountId || 'No treasury linked'}
                </div>
                {record.linkedDocumentIds?.[0] ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => goToHash(`#documents:${record.linkedDocumentIds?.[0]}`)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(126,242,255,0.28)',
                        background: 'rgba(54, 215, 255, 0.09)',
                        color: '#effcff',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Open Register Packet
                    </button>
                  </div>
                ) : null}
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Holder Ledger"
        description="Holder-side issue, assignment, presentment, pledge, deposit, and performance entries tied back to instruments, remittances, and settlements."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.holderLedgerEntries.map((entry) => (
            <RecordCard
              key={entry.id}
              title={`${entry.holderLabel} · ${entry.entryType}`}
              subtitle={`${entry.entryDate} · ${formatMoney(entry.amount, entry.currency)}`}
            >
              <div style={{ display: 'grid', gap: 8, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Resulting balance:</strong>{' '}
                  {formatMoney(entry.resultingBalance, entry.currency)}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Register:</strong> {entry.registerId}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Settlement / remittance:</strong>{' '}
                  {entry.linkedSettlementId || 'No settlement linked'} /{' '}
                  {entry.linkedRemittanceStatementId || 'No remittance linked'}
                </div>
                {entry.notes ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Notes:</strong> {entry.notes}
                  </div>
                ) : null}
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

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
                  <button
                    type="button"
                    onClick={() => goToHash(resolveSettlementAction(flow).hash)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(126,242,255,0.28)',
                      background: 'rgba(54, 215, 255, 0.09)',
                      color: '#effcff',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    {resolveSettlementAction(flow).label}
                  </button>
                </div>
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
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Discharge method:</strong>{' '}
                    {flow.settlement?.dischargeMethod ?? 'not designated'}
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
        title="Instrument Settlement Desk"
        description="Track obligations recognized before cash, performance status, and which treasury or bank rail actually discharges the instrument."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.instrumentSettlements.map((record) => (
            <div key={record.id}>
              <RecordEditorCard
                title={record.title}
                subtitle={`${record.dischargeMethod} · ${record.performanceStatus} · ${formatMoney(record.faceAmount, record.currency)}`}
                record={record}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    instrumentSettlements: prev.instrumentSettlements.map((item) =>
                      item.id === record.id ? nextRecord : item
                    ),
                  }))
                }
              />
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  background: 'rgba(10, 11, 24, 0.72)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--cf-muted)',
                  lineHeight: 1.6,
                }}
              >
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Legal Identifier:</strong>{' '}
                  {record.legalIdentifier || 'Not assigned'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Source Deposit:</strong>{' '}
                  {record.sourceDepositStatus || 'not tracked'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Obligation Schedules"
        description="Open obligations, recurring performance schedules, and what is expected to be presented or discharged next."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.obligations.map((obligation) => (
            <RecordCard
              key={obligation.id}
              title={obligation.title}
              subtitle={`${obligation.obligationType} · ${obligation.status} · ${formatMoney(obligation.amount, 'USD')}`}
            >
              <div style={{ display: 'grid', gap: 8, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => goToHash(resolveObligationAction(obligation).hash)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(126,242,255,0.28)',
                      background: 'rgba(54, 215, 255, 0.09)',
                      color: '#effcff',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    {resolveObligationAction(obligation).label}
                  </button>
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Legal Identifier:</strong>{' '}
                  {obligation.legalIdentifier || 'Not assigned'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Payment medium:</strong>{' '}
                  {obligation.paymentMedium}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Recurring schedule:</strong>{' '}
                  {obligation.recurringSchedule?.enabled
                    ? `${obligation.recurringSchedule.frequency || 'scheduled'} every ${
                        obligation.recurringSchedule.interval || 1
                      }${obligation.recurringSchedule.nextDueDate ? ` | next ${obligation.recurringSchedule.nextDueDate}` : ''}`
                    : 'Not marked recurring'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Auto presentment:</strong>{' '}
                  {obligation.recurringSchedule?.autoCreatePresentment ? 'Enabled' : 'Manual'}
                </div>
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Remittance Statements"
        description="Statements and remittance-check style records that evidence performance, with MICR shown only as informational unless the settlement is bank-backed."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.remittanceStatements.map((record) => (
            <RecordCard
              key={record.id}
              title={record.title}
              subtitle={`${record.dischargeMethod} · ${record.status} · ${record.statementDate}`}
            >
              <div style={{ display: 'grid', gap: 8, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => goToHash(resolveRemittanceAction(record).hash)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(126,242,255,0.28)',
                      background: 'rgba(54, 215, 255, 0.09)',
                      color: '#effcff',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    {resolveRemittanceAction(record).label}
                  </button>
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Payer / Payee:</strong>{' '}
                  {record.payerName} {'->'} {record.payeeName}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Amount:</strong>{' '}
                  {formatMoney(record.amount, record.currency)}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>MICR mode:</strong>{' '}
                  {record.micrLine?.mode ?? 'not assigned'}
                  {record.micrLine?.routingNumber ? ` | routing ${record.micrLine.routingNumber}` : ''}
                  {record.micrLine?.accountNumberMask ? ` | acct ****${record.micrLine.accountNumberMask}` : ''}
                </div>
                {record.notes ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Control note:</strong> {record.notes}
                  </div>
                ) : null}
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
