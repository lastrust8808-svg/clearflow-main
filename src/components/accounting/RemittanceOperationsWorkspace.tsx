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
import PageSection from '../ui/PageSection';

interface RemittanceOperationsWorkspaceProps {
  payments: PaymentRecord[];
  customers: CustomerRecord[];
  vendors: VendorRecord[];
  bankAccounts: BankAccountRecord[];
  ledgerAccounts: LedgerAccountRecord[];
  treasuryAccounts: TreasuryAccountRecord[];
  wallets: WalletRecord[];
  onChainTransactions: OnChainTransactionRecord[];
  onApprovePayment: (paymentId: string) => void;
  onReleasePayment: (paymentId: string) => void;
  onConfirmWalletSettlement: (paymentId: string) => void;
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
  bankAccounts,
  ledgerAccounts,
  treasuryAccounts,
  wallets,
  onChainTransactions,
  onApprovePayment,
  onReleasePayment,
  onConfirmWalletSettlement,
  operationsNotice,
}: RemittanceOperationsWorkspaceProps) {
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
              const needsReview =
                payment.settlementExecution?.processorStatus === 'requires_review' ||
                payment.settlementExecution?.processorStatus === 'blocked';
              const canApprove =
                !needsReview &&
                payment.approvalStatus !== 'approved' &&
                payment.releaseStatus !== 'released';
              const canRelease =
                !needsReview &&
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
                      <span style={badgeStyle(needsReview ? 'warn' : 'info')}>
                        {payment.settlementExecution?.processorStatus || payment.status}
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
                    {payment.method === 'digital_asset' ? (
                      <div>
                        <strong style={{ color: '#e5e7eb' }}>Wallet Destination</strong>
                        <div>
                          {vendor?.paymentInstructions?.digitalWalletAddress ||
                            'No vendor wallet address on file'}
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
                    {payment.settlementExecution?.executionReason ||
                      payment.notes ||
                      'Settlement is ready for operator review.'}
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
