import type { BillRecord } from '../../types/core';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import type { AccountingStats, JournalDraft } from './accountingTypes';

interface AccountingDashboardSectionProps {
  stats: AccountingStats;
  journalDrafts: JournalDraft[];
  bills: BillRecord[];
}

export default function AccountingDashboardSection({
  stats,
  journalDrafts,
  bills,
}: AccountingDashboardSectionProps) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Invoices Due" value={stats.openInvoiceCount} />
        <StatCard
          label="Invoice Balance Due"
          value={`$${stats.openInvoiceAmount.toLocaleString()}`}
        />
        <StatCard label="Monthly In" value={`$${stats.totalMonthlyIn.toLocaleString()}`} />
        <StatCard label="Monthly Out" value={`$${stats.totalMonthlyOut.toLocaleString()}`} />
        <StatCard label="Open Bills" value={stats.openBillCount} />
        <StatCard label="Bill Balance Due" value={`$${stats.openBillAmount.toLocaleString()}`} />
        <StatCard label="Upcoming Payments" value={stats.upcomingPayments} />
        <StatCard label="Receipts Logged" value={stats.receiptCount} />
        <StatCard label="Journal Entries" value={stats.journalCount} />
      </div>

      <PageSection
        title="Accounting Overview"
        description="Top-level ERP accounting status, intake actions, and workflow routing."
      >
        <div style={{ display: 'grid', gap: 12, color: '#d1d5db', lineHeight: 1.7 }}>
          <div>
            Use the action bar above to create invoices, journal entries, bills, receipts, and
            quotes.
          </div>
          <div>
            Use the tabs to move into detailed ERP work areas for customers, vendors, payables,
            receivables, and reconciliation.
          </div>
        </div>
      </PageSection>

      <PageSection
        title="Recent Journal Entries"
        description="Most recent persisted journal entries captured in the ERP layer."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {journalDrafts.length === 0 ? (
            <div style={{ color: '#d1d5db' }}>No journal entries recorded yet.</div>
          ) : (
            journalDrafts.slice(0, 5).map((entry) => (
              <div
                key={entry.id}
                style={{
                  border: '1px solid rgba(148,163,184,0.2)',
                  borderRadius: 12,
                  padding: 14,
                  background: 'rgba(15,23,42,0.45)',
                  color: '#e5e7eb',
                }}
              >
                <div style={{ fontWeight: 700 }}>{entry.entryNumber}</div>
                <div style={{ color: '#94a3b8', marginTop: 6 }}>
                  {entry.entryDate || 'No date'} | {entry.debitAccount || 'Debit'} /{' '}
                  {entry.creditAccount || 'Credit'} | ${(entry.amount ?? 0).toLocaleString()}
                </div>
                <div style={{ color: '#d1d5db', marginTop: 6 }}>{entry.memo || 'No memo'}</div>
              </div>
            ))
          )}
        </div>
      </PageSection>

      <PageSection
        title="Upcoming Bills / Payments"
        description="Quick operational visibility."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {bills.slice(0, 5).map((record) => (
            <div
              key={record.id}
              style={{
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: 12,
                padding: 14,
                background: 'rgba(15,23,42,0.45)',
                color: '#e5e7eb',
              }}
            >
              <div style={{ fontWeight: 700 }}>{record.billNumber ?? record.id}</div>
              <div style={{ color: '#94a3b8', marginTop: 6 }}>
                {record.status ?? 'entered'} | {record.currency ?? 'USD'}{' '}
                {(record.balanceDue ?? record.totalAmount ?? 0).toLocaleString()}
              </div>
            </div>
          ))}
          {bills.length === 0 && (
            <div style={{ color: '#d1d5db' }}>No upcoming bills or payments recorded yet.</div>
          )}
        </div>
      </PageSection>
    </div>
  );
}
