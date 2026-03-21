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
  const remittanceEligible = data.ledgerAccounts.filter((item) => item.remittanceEligible).length;
  const postedJournals = data.journalEntries.filter((item) => item.status === 'posted').length;

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
        <StatCard label="Treasury Accounts" value={data.treasuryAccounts.length} />
        <StatCard label="Ledger Accounts" value={data.ledgerAccounts.length} />
        <StatCard label="Remittance-Eligible" value={remittanceEligible} />
        <StatCard label="Posted Journals" value={postedJournals} />
      </div>

      <PageSection
        title="Treasury Accounts"
        description="Private reserve, remittance-clearing, and instrument-pool accounts that govern how obligations are discharged."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.treasuryAccounts.length === 0 ? (
            <div style={{ color: 'var(--cf-muted)' }}>No treasury accounts have been established yet.</div>
          ) : (
            data.treasuryAccounts.map((account) => (
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
          {data.ledgerAccounts.map((account) => (
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
