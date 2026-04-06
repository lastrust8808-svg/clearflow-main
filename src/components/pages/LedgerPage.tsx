import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface LedgerPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function LedgerPage({ data, setData }: LedgerPageProps) {
  const visibleTreasuryAccounts = data.treasuryAccounts.filter(
    (item) => !item.name.startsWith('ClearFlow '),
  );
  const visibleLedgerAccounts = data.ledgerAccounts.filter(
    (item) => !item.name.startsWith('ClearFlow '),
  );
  const remittanceEligible = visibleLedgerAccounts.filter((item) => item.remittanceEligible).length;
  const postedJournals = data.journalEntries.filter((item) => item.status === 'posted').length;
  const recentPresentments = [...data.couponPresentments]
    .sort((left, right) => (right.presentmentDate || '').localeCompare(left.presentmentDate || ''))
    .slice(0, 5);
  const recentSettlementPosts = [...data.settlements]
    .sort((left, right) =>
      (right.actualSettlementDate || right.initiatedAt || '').localeCompare(
        left.actualSettlementDate || left.initiatedAt || ''
      )
    )
    .slice(0, 5);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Ledger & Treasury</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Ledger accounts linked to assets, wallets, entity ownership, and persisted ERP journal activity.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Treasury Accounts" value={visibleTreasuryAccounts.length} />
        <StatCard label="Ledger Accounts" value={visibleLedgerAccounts.length} />
        <StatCard label="Remittance-Eligible" value={remittanceEligible} />
        <StatCard label="Posted Journals" value={postedJournals} />
      </div>

      <PageSection
        title="Recent Posting Validation"
        description="Use this as a ledger-side confirmation that remittance and settlement submissions actually posted into books and treasury records."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <WorkbenchRecordCard
            title="Recent Presentments"
            subtitle={`${data.couponPresentments.length} total`}
            summaryItems={[
              { label: 'Latest count', value: recentPresentments.length },
              { label: 'Posted journals', value: postedJournals },
              { label: 'Settlements', value: data.settlements.length },
              { label: 'Payments', value: data.payments.length },
            ]}
            record={{
              id: 'ledger-presentment-validation',
              notes: recentPresentments
                .map(
                  (presentment) =>
                    `${presentment.presentmentDate} | ${presentment.receiverName} | ${presentment.status} | ${presentment.amount}`
                )
                .join('\n'),
            }}
            onSave={() => {}}
          >
            {recentPresentments.length === 0
              ? 'No presentments have posted yet.'
              : recentPresentments.map((presentment) => (
                  <div key={presentment.id} style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                    <strong>{presentment.receiverName}</strong> | {presentment.status} | $
                    {presentment.amount.toLocaleString()}
                    <div style={{ color: 'var(--cf-muted)' }}>
                      {presentment.presentmentDate} | {presentment.couponReference || 'No coupon ref'}
                    </div>
                  </div>
                ))}
          </WorkbenchRecordCard>

          <WorkbenchRecordCard
            title="Recent Settlement Posts"
            subtitle="Settlement and release trace"
            summaryItems={[
              { label: 'Recent posts', value: recentSettlementPosts.length },
              { label: 'Treasury accounts', value: visibleTreasuryAccounts.length },
              { label: 'Ledger accounts', value: visibleLedgerAccounts.length },
              { label: 'Remittance eligible', value: remittanceEligible },
            ]}
            record={{
              id: 'ledger-settlement-validation',
              notes: recentSettlementPosts
                .map(
                  (settlement) =>
                    `${settlement.actualSettlementDate || settlement.initiatedAt} | ${settlement.executionReference || settlement.id} | ${settlement.status} | ${settlement.settledAmount}`
                )
                .join('\n'),
            }}
            onSave={() => {}}
          >
            {recentSettlementPosts.length === 0
              ? 'No settlement records have posted yet.'
              : recentSettlementPosts.map((settlement) => (
                  <div key={settlement.id} style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                    <strong>{settlement.executionReference || settlement.id}</strong> | {settlement.status} | $
                    {settlement.settledAmount.toLocaleString()}
                    <div style={{ color: 'var(--cf-muted)' }}>
                      {settlement.actualSettlementDate || settlement.initiatedAt || 'No date'} |{' '}
                      {settlement.executionRail || settlement.path}
                    </div>
                  </div>
                ))}
          </WorkbenchRecordCard>
        </div>
      </PageSection>

      <PageSection
        title="Treasury Accounts"
        description="Private reserve, remittance-clearing, and instrument-pool accounts that govern how obligations are discharged."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {visibleTreasuryAccounts.length === 0 ? (
            <div style={{ color: 'var(--cf-muted)' }}>No treasury accounts have been established yet.</div>
          ) : (
            visibleTreasuryAccounts.map((account) => (
              <WorkbenchRecordCard
                key={account.id}
                title={account.name}
                subtitle={`${account.treasuryType} | ${account.originatingAuthority}`}
                summaryItems={[
                  { label: 'Currency', value: account.currency },
                  { label: 'Available', value: account.availableBalance.toLocaleString() },
                  { label: 'Reserved', value: account.reservedBalance?.toLocaleString() || '0' },
                  { label: 'Remittance', value: account.remittanceEnabled ? 'Enabled' : 'Disabled' },
                ]}
                record={account}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    treasuryAccounts: prev.treasuryAccounts.map((item) =>
                      item.id === account.id ? nextRecord : item
                    ),
                  }))
                }
              >
                {account.notes ||
                  'Use advanced edit for linked obligations, bank partner mapping, and authority posture.'}
              </WorkbenchRecordCard>
            ))
          )}
        </div>
      </PageSection>

      <PageSection title="Ledger Accounts" description="Books, reserve sources, memo accounts, and remittance-capable balances.">
        <div style={{ display: 'grid', gap: 16 }}>
          {visibleLedgerAccounts.map((account) => (
            <WorkbenchRecordCard
              key={account.id}
              title={`${account.code} | ${account.name}`}
              subtitle={`${account.accountType} | ${account.currency ?? '-'}`}
              summaryItems={[
                { label: 'Entity', value: data.entities.find((item) => item.id === account.entityId)?.displayName || account.entityId },
                { label: 'Balance', value: account.balance.toLocaleString() },
                { label: 'Remittance', value: account.remittanceEligible ? account.remittanceClassification || 'eligible' : 'not eligible' },
                { label: 'Wallet Links', value: account.linkedWalletIds?.length || 0 },
              ]}
              record={account}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  ledgerAccounts: prev.ledgerAccounts.map((item) =>
                    item.id === account.id ? nextRecord : item
                  ),
                }))
              }
            >
              Use advanced edit to manage linked assets, wallet maps, and remittance classifications.
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Journal Entries"
        description="Persisted journal history for ERP posting, audit review, and treasury tie-out."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.journalEntries.length === 0 ? (
            <div style={{ color: 'var(--cf-muted)' }}>No journal entries have been posted yet.</div>
          ) : (
            data.journalEntries.map((entry) => (
              <WorkbenchRecordCard
                key={entry.id}
                title={entry.entryNumber}
                subtitle={`${entry.status} | ${entry.entryDate} | ${entry.source}`}
                summaryItems={[
                  { label: 'Debit', value: entry.debitAccount },
                  { label: 'Credit', value: entry.creditAccount },
                  { label: 'Amount', value: entry.amount.toLocaleString() },
                  { label: 'Auto Reconcile', value: entry.autoReconcileStatus || 'Not assigned' },
                ]}
                record={entry}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    journalEntries: prev.journalEntries.map((item) =>
                      item.id === entry.id ? nextRecord : item
                    ),
                  }))
                }
              >
                {entry.memo}
              </WorkbenchRecordCard>
            ))
          )}
        </div>
      </PageSection>
    </div>
  );
}
