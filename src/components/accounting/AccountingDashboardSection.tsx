import type {
  BillRecord,
  DirectDepositAuthorizationRecord,
  EmployeeRecord,
  ExpenseRecord,
  PaymentRecord,
  ReceiptRecord,
  TaxReportingLinkRecord,
} from '../../types/core';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import type { AccountingStats, JournalDraft } from './accountingTypes';

interface AccountingDashboardSectionProps {
  stats: AccountingStats;
  journalDrafts: JournalDraft[];
  bills: BillRecord[];
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
  receipts: ReceiptRecord[];
  employees: EmployeeRecord[];
  directDepositAuthorizations: DirectDepositAuthorizationRecord[];
  taxReportingLinks: TaxReportingLinkRecord[];
}

export default function AccountingDashboardSection({
  stats,
  journalDrafts,
  bills,
  payments,
  expenses,
  receipts,
  employees,
  directDepositAuthorizations,
  taxReportingLinks,
}: AccountingDashboardSectionProps) {
  const incomingReceiptsTotal = payments
    .filter((payment) => payment.direction === 'incoming')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const receiptBackedExpenseTotal = expenses
    .filter((expense) => expense.receiptId)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const contractorDisbursementTotal = payments
    .filter(
      (payment) =>
        payment.direction === 'outgoing' &&
        payment.counterpartyType === 'vendor' &&
        payment.status !== 'failed'
    )
    .reduce((sum, payment) => sum + payment.amount, 0);
  const payrollAnnualizedTotal = employees.reduce((sum, employee) => {
    if (employee.compensationType === 'salary') {
      return sum + (employee.annualSalary || 0);
    }

    if (employee.compensationType === 'hourly') {
      return sum + ((employee.hourlyRate || 0) * (employee.defaultHoursPerPeriod || 0) * 26);
    }

    return sum;
  }, 0);
  const activeDirectDepositForms = directDepositAuthorizations.filter(
    (item) => item.status === 'returned' || item.status === 'verified'
  ).length;

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
        title="Federal & State Tax Running Ledgers"
        description="Live operating totals from receipts, expenses, vendor disbursements, and payroll. These are running ledgers for review, not final filing results."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <StatCard label="Receipts Posted" value={`$${incomingReceiptsTotal.toLocaleString()}`} />
          <StatCard label="Receipt-Backed Expenses" value={`$${receiptBackedExpenseTotal.toLocaleString()}`} />
          <StatCard label="Contractor / Vendor Totals" value={`$${contractorDisbursementTotal.toLocaleString()}`} />
          <StatCard label="Annualized Payroll Base" value={`$${payrollAnnualizedTotal.toLocaleString()}`} />
          <StatCard label="1099 Review Links" value={taxReportingLinks.length} />
          <StatCard label="Direct Deposit Returns" value={activeDirectDepositForms} />
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 14, color: '#d1d5db', lineHeight: 1.7 }}>
          <div>
            <strong style={{ color: '#e5e7eb' }}>Federal running ledger:</strong> gross collections of $
            {incomingReceiptsTotal.toLocaleString()}, receipt-backed deductions of $
            {receiptBackedExpenseTotal.toLocaleString()}, contractor review base of $
            {contractorDisbursementTotal.toLocaleString()}, and annualized payroll base of $
            {payrollAnnualizedTotal.toLocaleString()}.
          </div>
          <div>
            <strong style={{ color: '#e5e7eb' }}>State running ledger:</strong> use the same posted operational base, then work jurisdiction-specific adjustments in the linked receipts, bills, and tax reporting records.
          </div>
          <div>
            <strong style={{ color: '#e5e7eb' }}>Payroll / contractor control:</strong> {employees.length} worker profiles, {receipts.length} retained receipts, and {taxReportingLinks.length} filing-review links are already tied into the ERP trail.
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
