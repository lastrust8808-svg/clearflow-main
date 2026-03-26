import type { CSSProperties } from 'react';
import type {
  BankAccountRecord,
  CustomerRecord,
  LedgerAccountRecord,
  PaymentRecord,
  TreasuryAccountRecord,
  VendorRecord,
  WalletRecord,
  OnChainTransactionRecord,
} from '../../types/core';
import type { SettlementRailControlView } from '../../services/settlementRailing.service';
import type { ObligationLifecycleSummary } from '../../services/obligationLifecycle.service';
import PageSection from '../ui/PageSection';

interface RemittanceOperationsWorkspaceProps {
  payments: PaymentRecord[];
  customers: CustomerRecord[];
  vendors: VendorRecord[];
  railControls: SettlementRailControlView[];
  bankAccounts: BankAccountRecord[];
  ledgerAccounts: LedgerAccountRecord[];
  treasuryAccounts: TreasuryAccountRecord[];
  wallets: WalletRecord[];
  onChainTransactions: OnChainTransactionRecord[];
  obligationLifecycleSummaries: ObligationLifecycleSummary[];
  onConfirmCompliance: (paymentId: string) => void;
  onApprovePayment: (paymentId: string) => void;
  onReleasePayment: (paymentId: string) => void;
  onConfirmWalletSettlement: (paymentId: string) => void;
  onStartCure: (obligationId: string) => void;
  onDeclareDefault: (summary: ObligationLifecycleSummary) => void;
  onDischargeObligation: (summary: ObligationLifecycleSummary) => void;
  operationsNotice?: string;
}

const cardStyle: CSSProperties = {
  border: '1px solid rgba(148,163,184,0.2)',
  borderRadius: 16,
  padding: 16,
  background: 'rgba(15,23,42,0.45)',
  display: 'grid',
  gap: 12,
};

const badgeStyle = (tone: 'neutral' | 'good' | 'warn' | 'info'): CSSProperties => {
  const palette = {
    neutral: {
      border: 'rgba(148,163,184,0.25)',
      background: 'rgba(51,65,85,0.35)',
      color: '#e2e8f0',
    },
    good: {
      border: 'rgba(45,212,191,0.28)',
      background: 'rgba(15,118,110,0.22)',
      color: '#ccfbf1',
    },
    warn: {
      border: 'rgba(251,191,36,0.28)',
      background: 'rgba(120,53,15,0.2)',
      color: '#fde68a',
    },
    info: {
      border: 'rgba(56,189,248,0.25)',
      background: 'rgba(8,47,73,0.28)',
      color: '#bae6fd',
    },
  }[tone];

  return {
    padding: '6px 10px',
    borderRadius: 999,
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    fontSize: 12,
    fontWeight: 700,
  };
};

const buttonStyle = (disabled?: boolean): CSSProperties => ({
  padding: '10px 14px',
  minHeight: 40,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: disabled ? 'rgba(51,65,85,0.5)' : 'rgba(15,23,42,0.4)',
  color: disabled ? '#94a3b8' : '#e5e7eb',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 600,
});

function isOutgoingRemittance(payment: PaymentRecord) {
  return (
    payment.direction === 'outgoing' &&
    payment.counterpartyType === 'vendor' &&
    (payment.method === 'ach' || payment.method === 'wire' || payment.method === 'digital_asset')
  );
}

export default function RemittanceOperationsWorkspace({
  payments,
  customers,
  vendors,
  railControls,
  bankAccounts,
  ledgerAccounts,
  treasuryAccounts,
  wallets,
  onChainTransactions,
  obligationLifecycleSummaries,
  onConfirmCompliance,
  onApprovePayment,
  onReleasePayment,
  onConfirmWalletSettlement,
  onStartCure,
  onDeclareDefault,
  onDischargeObligation,
  operationsNotice,
}: RemittanceOperationsWorkspaceProps) {
  const railControlByPaymentId = new Map(railControls.map((control) => [control.paymentId, control]));

  const resolveCounterpartyName = (payment: PaymentRecord) => {
    if (payment.counterpartyType === 'customer') {
      return customers.find((item) => item.id === payment.counterpartyId)?.name || 'Customer';
    }

    if (payment.counterpartyType === 'vendor') {
      return vendors.find((item) => item.id === payment.counterpartyId)?.name || 'Vendor';
    }

    return 'Counterparty';
  };

  const resolveSourceLabel = (payment: PaymentRecord) => {
    if (payment.sourceBankAccountId) {
      const bank = bankAccounts.find((item) => item.id === payment.sourceBankAccountId);
      return bank
        ? `${bank.accountName} - ${bank.institutionName} - ${bank.last4 || 'manual'}`
        : 'Bank account source';
    }

    if (payment.sourceLedgerAccountId) {
      const ledger = ledgerAccounts.find((item) => item.id === payment.sourceLedgerAccountId);
      return ledger
        ? `${ledger.code} - ${ledger.name} - ${ledger.remittanceClassification || 'ledger'}`
        : 'Ledger remittance source';
    }

    if (payment.treasuryAccountId) {
      const treasury = treasuryAccounts.find((item) => item.id === payment.treasuryAccountId);
      return treasury
        ? `${treasury.name} - ${treasury.treasuryType}`
        : 'Treasury remittance source';
    }

    if (payment.linkedWalletId) {
      const wallet = wallets.find((item) => item.id === payment.linkedWalletId);
      return wallet ? `${wallet.name} - ${wallet.network}` : 'Connected wallet source';
    }

    return 'Manual remittance source';
  };

  const remittancePayments = payments.filter(isOutgoingRemittance);
  const railSummary = {
    ready: railControls.filter((item) => item.overallStatus === 'ready').length,
    watch: railControls.filter((item) => item.overallStatus === 'watch').length,
    hold: railControls.filter((item) => item.overallStatus === 'hold').length,
    exception: railControls.filter((item) => item.overallStatus === 'exception').length,
  };
  const obligationControlQueue = obligationLifecycleSummaries
    .filter(
      (item) =>
        item.stage !== 'discharged' &&
        (item.stage === 'presented' ||
          item.stage === 'cure_running' ||
          item.stage === 'defaulted' ||
          item.watchItems.length > 0)
    )
    .slice(0, 4);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {operationsNotice ? (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid rgba(45,212,191,0.25)',
            background: 'rgba(15,118,110,0.16)',
            color: '#d1fae5',
            fontSize: 13,
          }}
        >
          {operationsNotice}
        </div>
      ) : null}
      <PageSection
        title="Railing Summary"
        description="Strong control posture across source funding, remittance instructions, proof, identifiers, and exception follow-up."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          {([
            ['Ready rails', railSummary.ready, 'good'],
            ['Watch items', railSummary.watch, 'info'],
            ['Held rails', railSummary.hold, 'warn'],
            ['Exceptions', railSummary.exception, 'warn'],
          ] as Array<[string, number, 'good' | 'info' | 'warn']>).map(([label, value, tone]) => (
            <div key={String(label)} style={cardStyle}>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
              <span style={badgeStyle(tone)}>{label}</span>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Default & Discharge Queue"
        description="Keep presentment, cure, default review, and discharge posture in the same operating lane as remittance release."
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {obligationControlQueue.length === 0 ? (
            <div style={{ color: '#d1d5db' }}>
              No obligations are waiting for cure, default, or discharge action here right now.
            </div>
          ) : (
            obligationControlQueue.map((summary) => (
              <div key={summary.obligation.id} style={cardStyle}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{summary.obligation.title}</div>
                    <div style={{ color: '#94a3b8', fontSize: 13 }}>
                      {summary.stage} | {summary.obligation.status} | {summary.obligation.legalIdentifier || 'ID pending'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={badgeStyle(summary.stage === 'defaulted' ? 'warn' : summary.stage === 'discharged' ? 'good' : 'info')}>
                      stage: {summary.stage}
                    </span>
                    <span style={badgeStyle(summary.outstandingAmount === 0 ? 'good' : 'warn')}>
                      outstanding: USD {summary.outstandingAmount.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 10,
                    color: '#d1d5db',
                    fontSize: 13,
                  }}
                >
                  <div>
                    <strong style={{ color: '#e5e7eb' }}>Presentment / cure</strong>
                    <div>
                      {summary.obligation.lastPresentmentDate || 'No presentment yet'}
                      {summary.obligation.cureDeadline
                        ? ` | cure ${summary.obligation.cureDeadline}`
                        : ''}
                    </div>
                  </div>
                  <div>
                    <strong style={{ color: '#e5e7eb' }}>Register / remittance</strong>
                    <div>
                      {summary.linkedRegister?.registerLabel || 'No register'} |{' '}
                      {summary.linkedRemittanceStatement?.title || 'No remittance'}
                    </div>
                  </div>
                </div>

                {summary.watchItems.length ? (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid rgba(251,191,36,0.28)',
                      background: 'rgba(120,53,15,0.2)',
                      color: '#fde68a',
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {summary.watchItems.join(' | ')}
                  </div>
                ) : null}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {summary.canStartCure ? (
                    <button
                      type="button"
                      onClick={() => onStartCure(summary.obligation.id)}
                      style={buttonStyle(false)}
                    >
                      Start Cure Window
                    </button>
                  ) : null}
                  {summary.canDeclareDefault ? (
                    <button
                      type="button"
                      onClick={() => onDeclareDefault(summary)}
                      style={buttonStyle(false)}
                    >
                      Declare Default
                    </button>
                  ) : null}
                  {summary.canDischarge ? (
                    <button
                      type="button"
                      onClick={() => onDischargeObligation(summary)}
                      style={buttonStyle(false)}
                    >
                      Mark Discharged
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </PageSection>
      <PageSection
        title="Remittance Control Desk"
        description="Approve, release, and confirm vendor ACH, EFT, wire, and digital-asset disbursements from connected banks, treasury, ledger, or wallet positions."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {remittancePayments.length === 0 ? (
            <div style={{ color: '#d1d5db' }}>
              No remittance payments are waiting in the operations desk yet.
            </div>
          ) : (
            remittancePayments.map((payment) => {
              const railControl = railControlByPaymentId.get(payment.id);
              const needsComplianceConfirmation =
                payment.complianceConfirmationStatus === 'pending';
              const needsReview =
                !needsComplianceConfirmation &&
                (payment.settlementExecution?.processorStatus === 'requires_review' ||
                  payment.settlementExecution?.processorStatus === 'blocked');
              const canConfirmCompliance =
                needsComplianceConfirmation && payment.releaseStatus !== 'released';
              const canApprove =
                !needsReview &&
                !needsComplianceConfirmation &&
                payment.approvalStatus !== 'approved' &&
                payment.releaseStatus !== 'released';
              const canRelease =
                !needsReview &&
                !needsComplianceConfirmation &&
                payment.releaseStatus !== 'released' &&
                (payment.approvalStatus === 'approved' ||
                  payment.approvalStatus === 'not_required');
              const linkedOnChainRecord = payment.linkedOnChainTransactionId
                ? onChainTransactions.find((item) => item.id === payment.linkedOnChainTransactionId)
                : undefined;
              const vendor = vendors.find((item) => item.id === payment.counterpartyId);
              const canConfirmWalletSettlement =
                payment.method === 'digital_asset' &&
                payment.releaseStatus === 'released' &&
                payment.status !== 'settled' &&
                linkedOnChainRecord?.status !== 'confirmed';

              return (
                <div key={payment.id} style={cardStyle}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {resolveCounterpartyName(payment)}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: 13 }}>
                        {payment.method.toUpperCase()} - {payment.currency} {payment.amount.toLocaleString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={badgeStyle(needsReview || needsComplianceConfirmation ? 'warn' : 'info')}>
                        {payment.settlementExecution?.processorStatus || payment.status}
                      </span>
                      <span
                        style={badgeStyle(
                          payment.complianceConfirmationStatus === 'confirmed'
                            ? 'good'
                            : payment.complianceConfirmationStatus === 'pending'
                              ? 'warn'
                              : 'neutral'
                        )}
                      >
                        compliance: {payment.complianceConfirmationStatus || 'not_required'}
                      </span>
                      <span
                        style={badgeStyle(
                          railControl?.overallStatus === 'ready'
                            ? 'good'
                            : railControl?.overallStatus === 'watch'
                              ? 'info'
                              : 'warn'
                        )}
                      >
                        rail: {railControl?.overallStatus || 'watch'}
                      </span>
                      <span
                        style={badgeStyle(
                          payment.approvalStatus === 'approved'
                            ? 'good'
                            : payment.approvalStatus === 'pending'
                              ? 'warn'
                              : 'neutral'
                        )}
                      >
                        approval: {payment.approvalStatus || 'not_required'}
                      </span>
                      <span
                        style={badgeStyle(
                          payment.releaseStatus === 'released'
                            ? 'good'
                            : payment.releaseStatus === 'ready_to_release'
                              ? 'info'
                              : 'neutral'
                        )}
                      >
                        release: {payment.releaseStatus || 'not_applicable'}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 10,
                      color: '#d1d5db',
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <strong style={{ color: '#e5e7eb' }}>Source</strong>
                      <div>{resolveSourceLabel(payment)}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#e5e7eb' }}>Rail</strong>
                      <div>
                        {payment.method === 'digital_asset'
                          ? linkedOnChainRecord?.network || 'Wallet execution'
                          : payment.settlementExecution?.executionRail || 'Not assigned'}
                      </div>
                    </div>
                    <div>
                      <strong style={{ color: '#e5e7eb' }}>Rail Namespace</strong>
                      <div>{railControl?.railNamespace || 'Not classified'}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#e5e7eb' }}>Execution Ref</strong>
                      <div>
                        {linkedOnChainRecord?.txHash ||
                          payment.settlementExecution?.executionReference ||
                          payment.linkedSettlementId ||
                          'Pending'}
                      </div>
                    </div>
                    <div>
                      <strong style={{ color: '#e5e7eb' }}>Release Token</strong>
                      <div>{payment.releaseTokenId || 'No token linked'}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#e5e7eb' }}>Rail Trace</strong>
                      <div>
                        {railControl
                          ? `${railControl.movementIdentifierCount} identifiers | ${railControl.openReturnCount} returns | ${railControl.openReclamationCount} reclamations`
                          : 'Pending control profile'}
                      </div>
                    </div>
                    <div>
                      <strong style={{ color: '#e5e7eb' }}>Proof Posture</strong>
                      <div>
                        {railControl
                          ? `${railControl.passCount}/${railControl.checks.length} controls passing`
                          : 'Pending control profile'}
                      </div>
                    </div>
                    {payment.method === 'digital_asset' ? (
                      <div>
                        <strong style={{ color: '#e5e7eb' }}>Wallet Destination</strong>
                        <div>
                          {vendor?.paymentInstructions?.digitalWalletAddress ||
                            'No vendor wallet address on file'}
                        </div>
                      </div>
                    ) : null}
                    {payment.method === 'digital_asset' ? (
                      <div>
                        <strong style={{ color: '#e5e7eb' }}>Payout Profile</strong>
                        <div>
                          {vendor?.paymentInstructions?.digitalPayoutTemplate || 'stablecoin'} |{' '}
                          {vendor?.paymentInstructions?.digitalAssetSymbol || 'asset not set'} |{' '}
                          {vendor?.paymentInstructions?.digitalWalletNetwork || 'network not set'}
                        </div>
                      </div>
                    ) : null}
                    {payment.method === 'digital_asset' ? (
                      <div>
                        <strong style={{ color: '#e5e7eb' }}>Execution Mode</strong>
                        <div>
                          {payment.linkedWalletId
                            ? wallets.find((item) => item.id === payment.linkedWalletId)?.executionSupport ||
                              'manual_release'
                            : 'manual_release'}
                        </div>
                      </div>
                    ) : null}
                    {payment.recurringSchedule?.enabled ? (
                      <div>
                        <strong style={{ color: '#e5e7eb' }}>Recurring</strong>
                        <div>
                          {payment.recurringSchedule.frequency || 'scheduled'} every{' '}
                          {payment.recurringSchedule.interval || 1}
                          {payment.recurringSchedule.nextRunDate
                            ? ` | next ${payment.recurringSchedule.nextRunDate}`
                            : ''}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: `1px solid ${
                        needsReview ? 'rgba(251,191,36,0.28)' : 'rgba(148,163,184,0.2)'
                      }`,
                      background: needsReview ? 'rgba(120,53,15,0.2)' : 'rgba(15,23,42,0.28)',
                      color: '#dbeafe',
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {payment.complianceConfirmationNote ||
                      railControl?.recommendedAction ||
                      payment.settlementExecution?.executionReason ||
                      payment.notes ||
                      'Settlement is ready for operator review.'}
                  </div>

                  {railControl ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: 12,
                          border: '1px solid rgba(148,163,184,0.2)',
                          background: 'rgba(15,23,42,0.28)',
                          display: 'grid',
                          gap: 8,
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#e5e7eb' }}>Blockers</div>
                        {railControl.blockers.length === 0 ? (
                          <div style={{ color: '#86efac', fontSize: 13 }}>
                            No hard blockers are open on this settlement rail.
                          </div>
                        ) : (
                          railControl.blockers.map((item) => (
                            <div key={item} style={{ color: '#fde68a', fontSize: 13, lineHeight: 1.5 }}>
                              {item}
                            </div>
                          ))
                        )}
                      </div>
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: 12,
                          border: '1px solid rgba(148,163,184,0.2)',
                          background: 'rgba(15,23,42,0.28)',
                          display: 'grid',
                          gap: 8,
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#e5e7eb' }}>Watch Items</div>
                        {railControl.watchItems.length === 0 ? (
                          <div style={{ color: '#93c5fd', fontSize: 13 }}>
                            No follow-up watch items are open right now.
                          </div>
                        ) : (
                          railControl.watchItems.map((item) => (
                            <div key={item} style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }}>
                              {item}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => onConfirmCompliance(payment.id)}
                      disabled={!canConfirmCompliance}
                      style={buttonStyle(!canConfirmCompliance)}
                    >
                      Confirm Compliance
                    </button>
                    <button
                      type="button"
                      onClick={() => onApprovePayment(payment.id)}
                      disabled={!canApprove}
                      style={buttonStyle(!canApprove)}
                    >
                      Approve Remittance
                    </button>
                    <button
                      type="button"
                      onClick={() => onReleasePayment(payment.id)}
                      disabled={!canRelease}
                      style={buttonStyle(!canRelease)}
                    >
                      Release Settlement
                    </button>
                    {payment.method === 'digital_asset' ? (
                      <button
                        type="button"
                        onClick={() => onConfirmWalletSettlement(payment.id)}
                        disabled={!canConfirmWalletSettlement}
                        style={buttonStyle(!canConfirmWalletSettlement)}
                      >
                        Check / Confirm On-Chain
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PageSection>

      <PageSection
        title="All Payments"
        description="Full ERP payment record inventory, including non-remittance receipts and manual postings."
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {payments.length === 0 ? (
            <div style={{ color: '#d1d5db' }}>No payment records yet.</div>
          ) : (
            payments.map((payment) => (
              <div key={payment.id} style={{ ...cardStyle, gap: 8 }}>
                <div style={{ fontWeight: 700 }}>{payment.id}</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>
                  {payment.direction} | {payment.status} | {payment.method} | {payment.currency}{' '}
                  {payment.amount.toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </PageSection>
    </div>
  );
}
