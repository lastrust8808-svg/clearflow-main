import type {
  BillRecord,
  BorrowingFacilityRecord,
  CollateralHoldingRecord,
  ComplianceTagRecord,
  DigitalAssetRecord,
  DirectDepositAuthorizationRecord,
  DocumentRecord,
  EntityRecord,
  EntityMarkUsageRecord,
  EmployeeRecord,
  ExpenseRecord,
  MovementIdentifierRecord,
  ObligationRecord,
  PaymentRecord,
  ReceiptRecord,
  ReturnEventRecord,
  TaxReportingLinkRecord,
  TreasuryAccountRecord,
  FuturesStrategyRecord,
  LiquidationPlanRecord,
  WorkspaceSettingsRecord,
} from '../../types/core';
import type { SettlementRailControlView } from '../../services/settlementRailing.service';
import type { ObligationLifecycleSummary } from '../../services/obligationLifecycle.service';
import { buildEntityMarkRailViews } from '../../services/entityMarkRail.service';
import { buildCapitalStrategySummary } from '../../services/capitalStrategy.service';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import type { AccountingStats, JournalDraft } from './accountingTypes';

interface AccountingDashboardSectionProps {
  stats: AccountingStats;
  entities: EntityRecord[];
  journalDrafts: JournalDraft[];
  bills: BillRecord[];
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
  receipts: ReceiptRecord[];
  employees: EmployeeRecord[];
  directDepositAuthorizations: DirectDepositAuthorizationRecord[];
  taxReportingLinks: TaxReportingLinkRecord[];
  documents: DocumentRecord[];
  obligations: ObligationRecord[];
  complianceTags: ComplianceTagRecord[];
  movementIdentifiers: MovementIdentifierRecord[];
  returnEvents: ReturnEventRecord[];
  railControls: SettlementRailControlView[];
  obligationLifecycleSummaries: ObligationLifecycleSummary[];
  entityMarkUsageRecords: EntityMarkUsageRecord[];
  digitalAssets: DigitalAssetRecord[];
  treasuryAccounts: TreasuryAccountRecord[];
  borrowingFacilities: BorrowingFacilityRecord[];
  collateralHoldings: CollateralHoldingRecord[];
  futuresStrategies: FuturesStrategyRecord[];
  liquidationPlans: LiquidationPlanRecord[];
  workspaceSettings: WorkspaceSettingsRecord;
}

export default function AccountingDashboardSection({
  stats,
  entities,
  journalDrafts,
  bills,
  payments,
  expenses,
  receipts,
  employees,
  directDepositAuthorizations,
  taxReportingLinks,
  documents,
  obligations,
  complianceTags,
  movementIdentifiers,
  returnEvents,
  railControls,
  obligationLifecycleSummaries,
  entityMarkUsageRecords,
  digitalAssets,
  treasuryAccounts,
  borrowingFacilities,
  collateralHoldings,
  futuresStrategies,
  liquidationPlans,
  workspaceSettings,
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
  const formatDate = (value?: string) => (value ? value : 'No date');
  const infoCardStyle = {
    border: '1px solid rgba(148,163,184,0.2)',
    borderRadius: 12,
    padding: 14,
    background: 'rgba(15,23,42,0.45)',
    color: '#e5e7eb',
  } as const;
  const filingQueue = taxReportingLinks.filter(
    (link) =>
      link.status !== 'accepted' ||
      link.correctionStatus === 'pending' ||
      link.tinMatchStatus === 'pending' ||
      link.tinMatchStatus === 'mismatch'
  );
  const recurringObligations = obligations
    .filter((obligation) => obligation.status === 'open' && obligation.recurringSchedule?.enabled)
    .sort((left, right) =>
      (left.recurringSchedule?.nextDueDate || '9999-12-31').localeCompare(
        right.recurringSchedule?.nextDueDate || '9999-12-31'
      )
    );
  const railIssues = [
    ...returnEvents.filter((event) => event.status !== 'resolved'),
    ...movementIdentifiers.filter(
      (record) => record.status === 'returned' || record.status === 'draft'
    ),
  ].slice(0, 5);
  const recentAccountingDocuments = [...documents]
    .filter(
      (document) =>
        document.category === 'financial' ||
        document.linkedComplianceTagIds?.length ||
        document.sourceRecordType === 'bill' ||
        document.sourceRecordType === 'receipt' ||
        document.sourceRecordType === 'coupon_presentment' ||
        document.sourceRecordType === 'direct_deposit_request'
    )
    .sort((left, right) => (right.date || '').localeCompare(left.date || ''))
    .slice(0, 5);
  const highPriorityComplianceItems = complianceTags
    .filter(
      (tag) =>
        tag.status !== 'ok' &&
        (tag.category === 'tax' || tag.category === 'reporting' || tag.category === 'risk')
    )
    .sort((left, right) => (left.dueDate || '9999-12-31').localeCompare(right.dueDate || '9999-12-31'))
    .slice(0, 4);
  const railSummary = {
    ready: railControls.filter((item) => item.overallStatus === 'ready').length,
    watch: railControls.filter((item) => item.overallStatus === 'watch').length,
    hold: railControls.filter((item) => item.overallStatus === 'hold').length,
    exception: railControls.filter((item) => item.overallStatus === 'exception').length,
  };
  const priorityRailControls = railControls
    .filter((item) => item.overallStatus !== 'ready')
    .slice(0, 4);
  const obligationControlQueue = obligationLifecycleSummaries
    .filter(
      (item) =>
        item.stage !== 'discharged' &&
        (item.stage === 'presentment_due' ||
          item.stage === 'presented' ||
          item.stage === 'cure_running' ||
          item.stage === 'defaulted' ||
          item.watchItems.length > 0)
    )
    .slice(0, 5);
  const markReserveValue = entityMarkUsageRecords.reduce((sum, item) => sum + item.totalValue, 0);
  const markUnitsIssued = entityMarkUsageRecords.reduce((sum, item) => sum + item.unitsIssued, 0);
  const activeMarkAssets = digitalAssets.filter((item) =>
    item.name.toLowerCase().includes('mark reserve')
  );
  const markTreasuryAccounts = treasuryAccounts.filter((item) =>
    item.name.toLowerCase().includes('mark reserve')
  );
  const markRailViews = buildEntityMarkRailViews({
    entities,
    entityMarkUsageRecords,
    taxReportingLinks,
    workspaceSettings,
  });
  const markReadyCount = markRailViews.filter((item) => item.railStatus === 'ready').length;
  const markWatchCount = markRailViews.filter((item) => item.railStatus === 'watch').length;
  const liquidationCandidateCount = markRailViews.filter(
    (item) => item.liquidationFocus && item.liquidationFocus !== 'none',
  ).length;
  const markCurrency = entityMarkUsageRecords[0]?.currency || workspaceSettings.baseCurrency || 'USD';
  const capitalSummary = buildCapitalStrategySummary({
    borrowingFacilities,
    collateralHoldings,
    futuresStrategies,
    liquidationPlans,
  });

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
        <div style={{ display: 'grid', gap: 16 }}>
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

          <div style={{ color: '#94a3b8', lineHeight: 1.7 }}>
            Use the accounting action strip above for new work, and use the accounting section row to move between invoices, remittance, journal, payroll, bank feed, and reconciliation.
          </div>
        </div>
      </PageSection>

      <PageSection
        title="Settlement Rail Posture"
        description="Derived rail readiness across source control, counterparty instructions, proof, identifiers, exceptions, and reconciliation."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <StatCard label="Ready Rails" value={railSummary.ready} />
            <StatCard label="Watch Rails" value={railSummary.watch} />
            <StatCard label="Held Rails" value={railSummary.hold} />
            <StatCard label="Rail Exceptions" value={railSummary.exception} />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {priorityRailControls.length === 0 ? (
              <div style={{ color: '#d1d5db' }}>
                No unsettled rail blockers are open right now.
              </div>
            ) : (
              priorityRailControls.map((control) => (
                <div key={control.paymentId} style={infoCardStyle}>
                  <div style={{ fontWeight: 700 }}>
                    {control.executionLabel} | {control.railNamespace}
                  </div>
                  <div style={{ color: '#94a3b8', marginTop: 6 }}>
                    {control.overallStatus} | {control.passCount}/{control.checks.length} controls passing
                  </div>
                  <div style={{ color: '#d1d5db', marginTop: 6 }}>
                    {control.recommendedAction}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </PageSection>

      <PageSection
        title="Capital Strategy"
        description="Borrowing, collateral, futures overlays, and liquidation planning tied back to ERP cashflow and settlement readiness."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <StatCard label="Borrowed / Drawn" value={capitalSummary.activeBorrowingExposure.toLocaleString()} />
            <StatCard label="Capacity" value={capitalSummary.availableBorrowingCapacity.toLocaleString()} />
            <StatCard label="Pledged Collateral" value={capitalSummary.pledgedCollateralValue.toLocaleString()} />
            <StatCard label="Coverage" value={capitalSummary.collateralCoverageValue.toLocaleString()} />
            <StatCard label="Futures Notional" value={capitalSummary.activeFuturesNotional.toLocaleString()} />
            <StatCard label="Margin Posted" value={capitalSummary.activeFuturesMargin.toLocaleString()} />
            <StatCard label="Liquidation Target" value={capitalSummary.liquidationTargetAmount.toLocaleString()} />
            <StatCard label="Blocked Plans" value={capitalSummary.blockedLiquidationCount} />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {borrowingFacilities.slice(0, 2).map((facility) => (
              <div key={facility.id} style={infoCardStyle}>
                <div style={{ fontWeight: 700 }}>
                  {facility.facilityName} | {facility.facilityType} | {facility.status}
                </div>
                <div style={{ color: '#94a3b8', marginTop: 6 }}>
                  Drawn {facility.currency} {facility.drawnAmount.toLocaleString()} of {facility.commitmentAmount.toLocaleString()}
                </div>
                <div style={{ color: '#d1d5db', marginTop: 6 }}>
                  {facility.collateralRequirement || facility.notes || 'Collateral and facility logic not yet documented.'}
                </div>
              </div>
            ))}
            {liquidationPlans.slice(0, 2).map((plan) => (
              <div key={plan.id} style={infoCardStyle}>
                <div style={{ fontWeight: 700 }}>
                  {plan.planName} | {plan.objective} | {plan.status}
                </div>
                <div style={{ color: '#94a3b8', marginTop: 6 }}>
                  Target {workspaceSettings.baseCurrency} {plan.targetAmount.toLocaleString()} | projected {(
                    plan.projectedNetProceeds ?? plan.targetAmount
                  ).toLocaleString()}
                </div>
                <div style={{ color: '#d1d5db', marginTop: 6 }}>
                  {plan.notes || 'Liquidation path not yet documented.'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PageSection>

      <PageSection
        title="Entity Mark Reserve"
        description="Controlled-value usage issued from entity seal and signature application on generated records."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <StatCard label="Mark Usage Events" value={entityMarkUsageRecords.length} />
            <StatCard label="Mark Units Issued" value={markUnitsIssued} />
            <StatCard
              label="Reserve Value"
              value={`${markCurrency} ${markReserveValue.toLocaleString()}`}
            />
            <StatCard label="Reserve Accounts" value={markTreasuryAccounts.length} />
            <StatCard label="Ready Rails" value={markReadyCount} />
            <StatCard label="Watch Rails" value={markWatchCount} />
            <StatCard label="Liquidation Candidates" value={liquidationCandidateCount} />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={infoCardStyle}>
              Controlled mark assets live across {activeMarkAssets.length} digital reserve position(s)
              and {markTreasuryAccounts.length} treasury reserve account(s). Each stamped document can
              auto-create a journal-backed issuance event tied to the entity profile.
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {markRailViews.slice(0, 4).map((item) => (
                <div key={item.usageId} style={infoCardStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{item.markLabel}</div>
                  <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                    Rails: {item.appliedRails.join(', ')} | liquidation focus:{' '}
                    {item.liquidationFocus?.replace(/_/g, ' ') || 'none'} | value {item.currency}{' '}
                    {item.totalValue.toLocaleString()}
                  </div>
                  {item.watchReasons.length ? (
                    <div style={{ color: '#fca5a5', marginTop: 8 }}>
                      {item.watchReasons.join(' ')}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div style={{ color: '#94a3b8', lineHeight: 1.6 }}>
              Cross-desk reserve, entity, and document review stays in the left sidebar so Accounting remains focused on ERP operations.
            </div>
          </div>
        </div>
      </PageSection>

      <PageSection
        title="Default & Discharge Watch"
        description="Obligations moving through presentment, cure, default review, and discharge control."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {obligationControlQueue.length === 0 ? (
            <div style={{ color: '#d1d5db' }}>
              No obligations need default or discharge review right now.
            </div>
          ) : (
            obligationControlQueue.map((summary) => (
              <div key={summary.obligation.id} style={infoCardStyle}>
                <div style={{ fontWeight: 700 }}>{summary.obligation.title}</div>
                <div style={{ color: '#94a3b8', marginTop: 6 }}>
                  {summary.stage} | {summary.obligation.status} | $
                  {summary.outstandingAmount.toLocaleString()}
                </div>
                <div style={{ color: '#d1d5db', marginTop: 6 }}>
                  Presentments: {summary.presentmentCount} | Register:{' '}
                  {summary.linkedRegister?.registerLabel || 'missing'} | Remittance:{' '}
                  {summary.linkedRemittanceStatement?.title || 'pending'}
                </div>
                {summary.watchItems.length ? (
                  <div style={{ color: '#fde68a', marginTop: 6 }}>
                    {summary.watchItems.join(' | ')}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </PageSection>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <PageSection
          title="Filing Review Queue"
          description="Tax reporting links that still need match, filing, or correction work."
        >
          <div style={{ display: 'grid', gap: 10 }}>
            {filingQueue.length === 0 ? (
              <div style={{ color: '#d1d5db' }}>No filing items need review right now.</div>
            ) : (
              filingQueue.slice(0, 5).map((item) => (
                <div key={item.id} style={infoCardStyle}>
                  <div style={{ fontWeight: 700 }}>{item.counterpartyName}</div>
                  <div style={{ color: '#94a3b8', marginTop: 6 }}>
                    {item.formType || 'Reporting link'} | {item.status} | TIN {item.tinMatchStatus}
                  </div>
                <div style={{ color: '#d1d5db', marginTop: 6 }}>
                  Filing channel: {item.filingChannel || 'Not set'} | Correction:{' '}
                  {item.correctionStatus}
                </div>
                </div>
              ))
            )}
          </div>
        </PageSection>

        <PageSection
          title="Recurring Obligation Watch"
          description="Open recurring obligations that are due next and ready for presentment or review."
        >
          <div style={{ display: 'grid', gap: 10 }}>
            {recurringObligations.length === 0 ? (
              <div style={{ color: '#d1d5db' }}>No recurring obligations are scheduled right now.</div>
            ) : (
              recurringObligations.slice(0, 5).map((obligation) => (
                <div key={obligation.id} style={infoCardStyle}>
                  <div style={{ fontWeight: 700 }}>{obligation.title}</div>
                  <div style={{ color: '#94a3b8', marginTop: 6 }}>
                    {obligation.obligationType} | ${obligation.amount.toLocaleString()} | next due{' '}
                    {formatDate(obligation.recurringSchedule?.nextDueDate)}
                  </div>
                  <div style={{ color: '#d1d5db', marginTop: 6 }}>
                    Auto presentment:{' '}
                    {obligation.recurringSchedule?.autoCreatePresentment ? 'enabled' : 'off'}
                  </div>
                </div>
              ))
            )}
          </div>
        </PageSection>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <PageSection
          title="Rails & Return Issues"
          description="Movement identifiers and unresolved return events that still need attention."
        >
          <div style={{ display: 'grid', gap: 10 }}>
            {railIssues.length === 0 ? (
              <div style={{ color: '#d1d5db' }}>No rail exceptions are open right now.</div>
            ) : (
              railIssues.map((issue) => (
                <div key={issue.id} style={infoCardStyle}>
                  {'code' in issue ? (
                    <>
                      <div style={{ fontWeight: 700 }}>
                        {issue.code} - {issue.reason}
                      </div>
                      <div style={{ color: '#94a3b8', marginTop: 6 }}>
                        {issue.railNamespace} | {issue.status} | correction {issue.correctionStatus}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 700 }}>{issue.primaryIdentifier}</div>
                      <div style={{ color: '#94a3b8', marginTop: 6 }}>
                        {issue.railNamespace} | {issue.movementType} | {issue.status}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </PageSection>

        <PageSection
          title="Recent Accounting Outputs"
          description="Newest vault packets and accounting-linked records ready for the next step."
        >
          <div style={{ display: 'grid', gap: 10 }}>
            {recentAccountingDocuments.length === 0 ? (
              <div style={{ color: '#d1d5db' }}>No recent accounting packets or uploads yet.</div>
            ) : (
              recentAccountingDocuments.map((document) => (
                <div key={document.id} style={infoCardStyle}>
                  <div style={{ fontWeight: 700 }}>{document.title}</div>
                  <div style={{ color: '#94a3b8', marginTop: 6 }}>
                    {document.category} | {document.status} | {formatDate(document.date)}
                  </div>
                  <div style={{ color: '#d1d5db', marginTop: 6 }}>
                    {document.summary || 'Accounting-linked vault output ready for workflow follow-up.'}
                  </div>
                  <div style={{ color: '#94a3b8', marginTop: 8 }}>
                    Use the left sidebar to open Documents, Compliance, or Transactions for the linked packet.
                  </div>
                </div>
              ))
            )}
          </div>
        </PageSection>
      </div>

      <PageSection
        title="Accounting Risk & Compliance Signals"
        description="Priority tax, reporting, and risk tags already linked into the ERP workflow."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {highPriorityComplianceItems.length === 0 ? (
            <div style={{ color: '#d1d5db' }}>No high-priority accounting compliance tags need attention.</div>
          ) : (
            highPriorityComplianceItems.map((tag) => (
              <div key={tag.id} style={infoCardStyle}>
                <div style={{ fontWeight: 700 }}>{tag.label}</div>
                <div style={{ color: '#94a3b8', marginTop: 6 }}>
                  {tag.category} | {tag.status} | due {formatDate(tag.dueDate)}
                </div>
                <div style={{ color: '#d1d5db', marginTop: 6 }}>
                  {tag.notes || 'Linked accounting compliance control.'}
                </div>
                <div style={{ color: '#94a3b8', marginTop: 8 }}>
                  Review linked compliance packets from the sidebar when you leave the Accounting desk.
                </div>
              </div>
            ))
          )}
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
