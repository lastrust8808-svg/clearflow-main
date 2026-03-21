import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import PageSection from '../ui/PageSection';
import RecordEditorCard from '../ui/RecordEditorCard';

interface LedgerPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function LedgerPage({ data, setData }: LedgerPageProps) {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Ledger</h1>
        <p style={{ color: '#9ca3af', marginBottom: 0 }}>
          Ledger accounts linked to assets, wallets, entity ownership, and persisted ERP journal
          activity.
        </p>
      </div>

      <PageSection title="Ledger Accounts" description="Each ledger record is editable in-app.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.ledgerAccounts.map((account) => (
            <div key={account.id}>
              <RecordEditorCard
                title={`${account.code} | ${account.name}`}
                subtitle={`${account.accountType} | ${account.currency ?? '-'}`}
                record={account}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    ledgerAccounts: prev.ledgerAccounts.map((item) =>
                      item.id === account.id ? nextRecord : item
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Journal Entries"
        description="Persisted journal history for ERP posting and audit review."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.journalEntries.length === 0 ? (
            <div style={{ color: '#9ca3af' }}>No journal entries have been posted yet.</div>
          ) : (
            data.journalEntries.map((entry) => (
              <div key={entry.id}>
                <RecordEditorCard
                  title={entry.entryNumber}
                  subtitle={`${entry.status} | ${entry.entryDate} | ${entry.amount.toLocaleString()}`}
                  record={entry}
                  onSave={(nextRecord) =>
                    setData((prev) => ({
                      ...prev,
                      journalEntries: prev.journalEntries.map((item) =>
                        item.id === entry.id ? nextRecord : item
                      ),
                    }))
                  }
                />
              </div>
            ))
          )}
        </div>
      </PageSection>
    </div>
  );
}
