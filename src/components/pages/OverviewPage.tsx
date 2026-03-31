import type { CoreDataBundle } from '../../types/core';
import {
  isClearFlowRetainedDocument,
  isUserOwnedReadyDocument,
} from '../../services/documentStorage.service';
import { buildSettlementFlowViews } from '../../services/settlementAnalytics.service';
import { buildRemittanceRailControls } from '../../services/settlementRailing.service';
import { buildPrivateWealthRailSummaries } from '../../services/privateWealthRail.service';
import { buildTransactionProofChainViews } from '../../services/transactionProofChain.service';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import RecordCard from '../ui/RecordCard';

interface OverviewPageProps {
  data: CoreDataBundle;
}

export default function OverviewPage({ data }: OverviewPageProps) {
  const navigate = (hash: string) => {
    if (typeof window !== 'undefined') {
      window.location.hash = hash;
    }
  };
  const linkedEftpsTreasury = data.treasuryAccounts.find(
    (item) => item.id === data.workspaceSettings.eftpsLinkedTreasuryAccountId,
  );
  const linkedEftpsLedger = data.ledgerAccounts.find(
    (item) => item.id === data.workspaceSettings.eftpsTaxLedgerAccountId,
  );
  const linkedUspsBank = data.bankAccounts.find(
    (item) => item.id === data.workspaceSettings.uspsLinkedBankAccountId,
  );
  const linkedUspsPostageLedger = data.ledgerAccounts.find(
    (item) => item.id === data.workspaceSettings.uspsPostageLedgerAccountId,
  );
  const settlementFlows = buildSettlementFlowViews(data);
  const remittanceRailControls = buildRemittanceRailControls(data);
  const privateWealthRailSummaries = buildPrivateWealthRailSummaries(data);
  const transactionProofChains = buildTransactionProofChainViews(data);
  const totalAssetBookValue = data.assets.reduce((sum, item) => sum + item.bookValue, 0);
  const totalDigitalEstimatedValue = data.digitalAssets.reduce(
    (sum, item) => sum + item.estimatedValue,
    0,
  );
  const settlementReviewItems = settlementFlows.filter(
    (item) =>
      item.hasCoverageGap ||
      item.derivedAutoReconcileStatus !== 'matched' ||
      !item.verificationReady,
  ).length;
  const liquidCashReadyCount = settlementFlows.filter((item) => item.liquidCashReady).length;
  const autoReconciledCount = settlementFlows.filter(
    (item) => item.derivedAutoReconcileStatus === 'matched',
  ).length;
  const privateTreasuryCount = data.treasuryAccounts.filter(
    (item) => item.originatingAuthority === 'private_ledger_only',
  ).length;
  const instrumentDischargeCount = data.instrumentSettlements.filter(
    (item) => item.dischargeMethod === 'instrument_performance',
  ).length;
  const employeeCount = data.employees.length;
  const filingQueueCount = data.taxReportingLinks.filter(
    (item) => item.status === 'draft' || item.status === 'corrected',
  ).length;
  const directDepositCount = data.directDepositAuthorizations.filter(
    (item) => item.status === 'returned' || item.status === 'verified',
  ).length;
  const activeKybReviews = data.kybReviews.filter((item) => item.status !== 'cleared').length;
  const watchlistItems = data.watchlistScreenings.filter(
    (item) => item.status !== 'clear' || item.disposition === 'pending_review',
  ).length;
  const amlCasesOpen = data.amlCases.filter((item) => item.status !== 'closed').length;
  const retainedRecordCount = data.documents.filter(isClearFlowRetainedDocument).length;
  const userOwnedReadyCount = data.documents.filter(isUserOwnedReadyDocument).length;
  const driveRoutedCount = data.documents.filter(
    (item) => item.externalStorageStatus === 'routed'
  ).length;
  const activeEntityConnections = data.entityConnections.filter(
    (item) => item.status === 'active',
  ).length;
  const activeCreditRails = data.creditRails.filter((item) => item.status === 'active').length;
  const watchedCreditRails = data.creditRails.filter(
    (item) => item.status === 'watch' || item.status === 'blocked',
  ).length;
  const partnerBankRequiredCount = privateWealthRailSummaries.filter(
    (item) => item.legalUsePosture === 'partner_bank_required_external_presentment',
  ).length;
  const internalRetentionLedgerCount = data.ledgerAccounts.filter((item) =>
    item.name.includes('ClearFlow Retained Security Instruments Held')
  ).length;
  const recurringPaymentCount = data.payments.filter(
    (item) => item.recurringSchedule?.enabled,
  ).length;
  const recurringObligationCount = data.obligations.filter(
    (item) => item.recurringSchedule?.enabled,
  ).length;
  const eftpsOpenTaxItems = data.taxReportingLinks.filter((item) => item.status !== 'accepted').length;
  const sealedProofChainCount = transactionProofChains.filter(
    (item) => item.verificationStatus === 'sealed',
  ).length;
  const watchProofChainCount = transactionProofChains.filter(
    (item) => item.verificationStatus !== 'sealed',
  ).length;
  const complianceHeldPayments = data.payments.filter(
    (item) =>
      item.complianceConfirmationStatus === 'pending' ||
      item.approvalStatus === 'pending' ||
      item.releaseStatus === 'ready_to_release',
  );
  const priorityRailControls = remittanceRailControls
    .filter((item) => item.overallStatus !== 'ready')
    .slice(0, 5);
  const reconciliationQueue = data.reconciliations.filter(
    (item) => item.status !== 'completed' || item.statementReviewStatus === 'needs_review',
  );
  const directDepositReturns = data.directDepositAuthorizations.filter(
    (item) => item.status === 'returned' || item.status === 'declined',
  );
  const nextRecurringObligations = data.obligations
    .filter((item) => item.status === 'open' && item.recurringSchedule?.enabled)
    .sort((left, right) =>
      (left.recurringSchedule?.nextDueDate || '9999-12-31').localeCompare(
        right.recurringSchedule?.nextDueDate || '9999-12-31',
      ),
    )
    .slice(0, 5);
  const recentOutputs = [...data.documents]
    .filter(
      (item) =>
        item.outputStatus ||
        item.sourceRecordType === 'coupon_presentment' ||
        item.sourceRecordType === 'direct_deposit_request' ||
        item.linkedComplianceTagIds?.length,
    )
    .sort((left, right) => (right.date || '').localeCompare(left.date || ''))
    .slice(0, 6);
  const reviewItems =
    [
      ...data.complianceTags.filter((item) => item.status === 'review'),
      ...data.digitalAssetCompliance.filter(
        (item) => item.sourceOfFundsRecordStatus !== 'complete',
      ),
    ].length + settlementReviewItems;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Overview</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Core operating snapshot across entities, assets, on-chain activity, compliance, and
          records, with settlement-to-cash controls now folded into the same operating view.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Entities" value={data.entities.length} />
        <StatCard label="Ledger Accounts" value={data.ledgerAccounts.length} />
        <StatCard label="Asset Book Value" value={`$${totalAssetBookValue.toLocaleString()}`} />
        <StatCard
          label="Digital Asset Estimated Value"
          value={`$${totalDigitalEstimatedValue.toLocaleString()}`}
        />
        <StatCard label="Wallets" value={data.wallets.length} />
        <StatCard label="Treasury Accounts" value={data.treasuryAccounts.length} />
        <StatCard label="Private Treasury Only" value={privateTreasuryCount} />
        <StatCard label="Instrument Discharges" value={instrumentDischargeCount} />
        <StatCard label="Liquid Cash Ready" value={liquidCashReadyCount} />
        <StatCard label="Auto Reconciled" value={autoReconciledCount} />
        <StatCard label="Employees" value={employeeCount} />
        <StatCard label="Tax Filing Queue" value={filingQueueCount} />
        <StatCard label="Direct Deposit Returns" value={directDepositCount} />
        <StatCard label="KYC / KYB Reviews" value={activeKybReviews} />
        <StatCard label="Watchlist Items" value={watchlistItems} />
        <StatCard label="AML Cases" value={amlCasesOpen} />
        <StatCard label="Retained Records" value={retainedRecordCount} />
        <StatCard label="Sealed Proof Chains" value={sealedProofChainCount} />
        <StatCard label="Entity Connections" value={activeEntityConnections} />
        <StatCard label="Active Credit Rails" value={activeCreditRails} />
        <StatCard label="Watched Credit Rails" value={watchedCreditRails} />
        <StatCard label="Partner-Bank Required" value={partnerBankRequiredCount} />
        <StatCard
          label="EFTPS Profile"
          value={
            data.workspaceSettings.eftpsEnabled
              ? data.workspaceSettings.eftpsEnrollmentStatus?.replace(/_/g, ' ') || 'enabled'
              : 'off'
          }
        />
        <StatCard
          label="USPS Gateway"
          value={
            data.workspaceSettings.uspsGatewayEnabled
              ? data.workspaceSettings.uspsGatewayStatus?.replace(/_/g, ' ') || 'enabled'
              : 'off'
          }
        />
        <StatCard
          label="Rail Exceptions"
          value={
            remittanceRailControls.filter((item) => item.overallStatus === 'exception').length
          }
        />
        <StatCard label="Review Items" value={reviewItems} />
      </div>

      <PageSection
        title="Tax & Postal Connections"
        description="Treasury tax-payment and postal-operation profiles tied back into the workspace so operators can keep them active and evidenced."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          <RecordCard
            title="EFTPS Tax Payment Posture"
            subtitle={
              data.workspaceSettings.eftpsEnabled
                ? `${data.workspaceSettings.eftpsEnrollmentStatus?.replace(/_/g, ' ') || 'enabled'} | ${eftpsOpenTaxItems} tax items still open`
                : 'EFTPS profile not enabled'
            }
          >
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                EIN {data.workspaceSettings.eftpsEin || 'not set'} | operator{' '}
                {data.workspaceSettings.eftpsOperatorName || 'not set'} | evidence{' '}
                {data.workspaceSettings.eftpsLastEvidenceDate || 'not recorded'}.
              </div>
              <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                Treasury {linkedEftpsTreasury?.name || 'not linked'} | ledger{' '}
                {linkedEftpsLedger ? `${linkedEftpsLedger.code} ${linkedEftpsLedger.name}` : 'not linked'}.
              </div>
              <button
                type="button"
                onClick={() => navigate('#settings')}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Open EFTPS Profile
              </button>
            </div>
          </RecordCard>

          <RecordCard
            title="USPS Business Gateway Posture"
            subtitle={
              data.workspaceSettings.uspsGatewayEnabled
                ? `${data.workspaceSettings.uspsGatewayStatus?.replace(/_/g, ' ') || 'enabled'} | ${data.workspaceSettings.uspsServiceProfile?.replace(/_/g, ' ') || 'service not set'}`
                : 'USPS gateway profile not enabled'
            }
          >
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                CRID {data.workspaceSettings.uspsCrid || 'not set'} | MID{' '}
                {data.workspaceSettings.uspsMailerId || 'not set'} | permit{' '}
                {data.workspaceSettings.uspsPermitNumber || 'not set'}.
              </div>
              <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                Bank {linkedUspsBank?.accountName || 'not linked'} | postage ledger{' '}
                {linkedUspsPostageLedger
                  ? `${linkedUspsPostageLedger.code} ${linkedUspsPostageLedger.name}`
                  : 'not linked'}.
              </div>
              <button
                type="button"
                onClick={() => navigate('#settings')}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Open USPS Profile
              </button>
            </div>
          </RecordCard>
        </div>
      </PageSection>

      <PageSection
        title="Proof Chain Posture"
        description="Encrypted movement and verification chains tied to transactions, settlements, identifiers, and tokens."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          <RecordCard
            title="Encrypted Movement Chains"
            subtitle={`${sealedProofChainCount} sealed | ${watchProofChainCount} still need stronger proof coverage`}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                Transaction chains now tie movements, settlement references, identifiers, and proof
                tokens together before being mirrored into the encrypted backend proof vault.
              </div>
              <button
                type="button"
                onClick={() => navigate('#transactions')}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Open Proof Chains
              </button>
            </div>
          </RecordCard>

          <RecordCard
            title="Proof Coverage Watch"
            subtitle="Verification gaps rise here before they become control failures"
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
              Any transaction that still lacks a verified settlement token or complete movement
              identifier trail stays in watch posture until the chain is fully sealed.
            </div>
          </RecordCard>
        </div>
      </PageSection>

      <PageSection
        title="Connection Rail Posture"
        description="Watch the multi-entity and cross-user operating links that power internal credit, reserve-backed transfers, and controlled settlement."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          <RecordCard
            title="Internal + External Links"
            subtitle={`${activeEntityConnections} active connections | ${activeCreditRails} active rails`}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                Connection rails tie a user&apos;s entities and other users into one governed
                settlement map, so exposure, reserve support, validation rules, and release posture
                are all attached to the same operating relationship.
              </div>
              <button
                type="button"
                onClick={() => navigate('#entities')}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Open Entity Rails
              </button>
            </div>
          </RecordCard>

          <RecordCard
            title="Watch-State Exposure"
            subtitle={`${watchedCreditRails} rails currently need extra attention`}
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
              Rails move into watch or blocked state when validation, reserve coverage, or exposure
              posture needs review before another movement should clear.
            </div>
          </RecordCard>
        </div>
      </PageSection>

      <PageSection
        title="Private Wealth Banking Use"
        description="A control view of which rails are internal-book only, instrument-tracking only, or still require a partner bank or outside rail for presentment."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {privateWealthRailSummaries.slice(0, 4).map((summary) => (
            <RecordCard
              key={summary.railId}
              title={summary.railName}
              subtitle={summary.legalUsePosture.replace(/_/g, ' ')}
            >
              <div style={{ display: 'grid', gap: 8, color: '#d1d5db', lineHeight: 1.6 }}>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Identifier namespace:</strong>{' '}
                  {summary.identifierNamespace}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Operation class:</strong>{' '}
                  {summary.bankingOperationClass.replace(/_/g, ' ')}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Status:</strong> {summary.overallStatus}
                </div>
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Current System Scope"
        description="ClearFlow Core OS is now structured around unified asset, transaction, document, and compliance records."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          <RecordCard
            title="Unified Asset Model"
            subtitle="Traditional, digital, tokenized, and contract-based positions"
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
              Real estate, reserves, digital assets, tokenized claims, and smart-contract
              positions all live in one operating structure.
            </div>
          </RecordCard>

          <RecordCard
            title="Wallet-Aware Ledger"
            subtitle="Ledger accounts linked to custody and on-chain records"
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
              Wallets, token events, tx hashes, and chain-linked instruments can be tracked
              alongside ordinary accounting activity.
            </div>
          </RecordCard>

          <RecordCard
            title="Settlement To Cash"
            subtitle="Verification, liquidation stage, and journal tie-out in one control layer"
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
              Every transaction can now be viewed as a settlement flow, whether it clears as liquid
              cash, a tokenized credit, or a controlled debit with proof.
            </div>
          </RecordCard>

          <RecordCard
            title="Private Treasury Layer"
            subtitle="Reserve, remittance clearing, and instrument pools before outside rails"
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
              Treasury accounts now separate private-ledger discharge from bank-backed discharge,
              so obligations, reserves, and remittance pools can be tracked before external cash
              rails are used.
            </div>
          </RecordCard>

          <RecordCard
            title="Instrument Performance"
            subtitle="Recognize obligation, present remittance, then discharge by contract logic"
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
              Instrument settlements and remittance statements now model note/performance logic
              directly, instead of forcing everything to look like an ordinary bank payment.
            </div>
          </RecordCard>

          <RecordCard
            title="Document Vault Linking"
            subtitle="Control memos, issuance packets, reserve files, authority records"
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
              Records can be tied to assets, wallets, instruments, transactions, and compliance
              flags without splitting systems apart.
            </div>
          </RecordCard>

          <RecordCard
            title="Storage Split"
            subtitle="User-owned workspace files, ClearFlow-retained required records"
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
              Workspace records can remain user-owned where configured, while required platform
              records such as accepted terms, retained security support, and internal custody
              records stay inside ClearFlow&apos;s retained record layer.
            </div>
          </RecordCard>

          <RecordCard
            title="AI Workflow Layer"
            subtitle="Generators for token docs, reserve memos, snapshots, and control records"
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
              The first pass is ready for structured generators instead of isolated one-off tools.
            </div>
          </RecordCard>
        </div>
      </PageSection>

      <PageSection
        title="Storage & Retention"
        description="Visibility into what belongs to the user workspace versus what ClearFlow must keep internally."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          <RecordCard
            title="Retained Record Layer"
            subtitle={`${retainedRecordCount} retained documents | ${internalRetentionLedgerCount} internal deposit ledgers`}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                ClearFlow keeps its own internal agreement, security-support, and retained custody
                records for compliance posture, growth support, and projection-ready audit trails.
              </div>
              <button
                type="button"
                onClick={() => navigate('#documents')}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Open Documents
              </button>
            </div>
          </RecordCard>

          <RecordCard
            title="Workspace-Owned Layer"
            subtitle={`${userOwnedReadyCount} ready | ${driveRoutedCount} already routed to drive`}
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
              Operational uploads, packets, and working files are the best candidates for
              user-owned storage paths such as Google Drive, while retained platform records stay
              on ClearFlow&apos;s side.
            </div>
          </RecordCard>
        </div>
      </PageSection>

      <PageSection
        title="Operations Inbox"
        description="Live queues for the next accounting, settlement, payroll, and filing actions."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          <RecordCard
            title="Held Payments"
            subtitle={`${complianceHeldPayments.length} items awaiting compliance confirm, approval, or release`}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              {complianceHeldPayments.slice(0, 4).map((payment) => (
                <div key={payment.id} style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                  <strong style={{ color: '#effcff' }}>
                    {payment.direction} ${payment.amount.toLocaleString()}
                  </strong>
                  <div>
                    {payment.method} | compliance {payment.complianceConfirmationStatus || 'not_required'} | release{' '}
                    {payment.releaseStatus || 'not_applicable'}
                  </div>
                </div>
              ))}
              {complianceHeldPayments.length === 0 ? (
                <div style={{ color: '#d1d5db' }}>No held payments right now.</div>
              ) : null}
              <button
                type="button"
                onClick={() => navigate('#accounting:payments')}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Open Release Queue
              </button>
            </div>
          </RecordCard>

          <RecordCard
            title="Settlement Rail Watch"
            subtitle={`${priorityRailControls.length} remittance lanes with blockers or follow-up work`}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              {priorityRailControls.slice(0, 4).map((control) => (
                <div key={control.paymentId} style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                  <strong style={{ color: '#effcff' }}>
                    {control.executionLabel} | {control.railNamespace}
                  </strong>
                  <div>
                    {control.overallStatus} | {control.passCount}/{control.checks.length} controls passing
                  </div>
                  <div>{control.recommendedAction}</div>
                </div>
              ))}
              {priorityRailControls.length === 0 ? (
                <div style={{ color: '#d1d5db' }}>No rail blockers or watch items are open.</div>
              ) : null}
              <button
                type="button"
                onClick={() => navigate('#accounting:railOps')}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Open Rails & Codes
              </button>
            </div>
          </RecordCard>

          <RecordCard
            title="Reconciliation Queue"
            subtitle={`${reconciliationQueue.length} accounts with statement review or close work`}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              {reconciliationQueue.slice(0, 4).map((item) => (
                <div key={item.id} style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                  <strong style={{ color: '#effcff' }}>{item.periodStart} to {item.periodEnd}</strong>
                  <div>
                    {item.status} | review {item.statementReviewStatus || 'not_imported'} | approval{' '}
                    {item.closeApprovalStatus || 'pending'}
                  </div>
                </div>
              ))}
              {reconciliationQueue.length === 0 ? (
                <div style={{ color: '#d1d5db' }}>No reconciliation work is pending.</div>
              ) : null}
              <button
                type="button"
                onClick={() => navigate('#accounting:reconciliation')}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Open Reconciliation
              </button>
            </div>
          </RecordCard>

          <RecordCard
            title="Recurring Obligations"
            subtitle={`${recurringObligationCount} active cycles with next-due visibility`}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              {nextRecurringObligations.map((item) => (
                <div key={item.id} style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                  <strong style={{ color: '#effcff' }}>{item.title}</strong>
                  <div>
                    {item.obligationType} | ${item.amount.toLocaleString()} | next due{' '}
                    {item.recurringSchedule?.nextDueDate || 'Not set'}
                  </div>
                </div>
              ))}
              {nextRecurringObligations.length === 0 ? (
                <div style={{ color: '#d1d5db' }}>No recurring obligation cycles are active.</div>
              ) : null}
              <button
                type="button"
                onClick={() => navigate('#accounting:recurring')}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Open Recurring Desk
              </button>
            </div>
          </RecordCard>

          <RecordCard
            title="Payroll & Deposit Returns"
            subtitle={`${directDepositReturns.length} returned or declined deposit forms to work`}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              {directDepositReturns.slice(0, 4).map((item) => (
                <div key={item.id} style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                  <strong style={{ color: '#effcff' }}>{item.requestEmail}</strong>
                  <div>
                    {item.status} | delivery {item.formDeliveryMethod} | requested{' '}
                    {item.requestedAt?.slice(0, 10) || 'Not recorded'}
                  </div>
                </div>
              ))}
              {directDepositReturns.length === 0 ? (
                <div style={{ color: '#d1d5db' }}>No direct deposit forms need follow-up.</div>
              ) : null}
              <button
                type="button"
                onClick={() => navigate('#accounting:payroll')}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Open Payroll
              </button>
            </div>
          </RecordCard>
        </div>
      </PageSection>

      <PageSection
        title="Recent Workflow Outputs"
        description="Newest packets, returned forms, and accounting-linked records ready for the next desk."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {recentOutputs.length === 0 ? (
            <div style={{ color: 'var(--cf-muted)' }}>No recent workflow outputs are available yet.</div>
          ) : (
            recentOutputs.map((item) => (
              <RecordCard
                key={item.id}
                title={item.title}
                subtitle={`${item.category} | ${item.status} | ${item.date}`}
              >
                <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>
                  {item.summary || 'Workflow packet ready for the next operating desk.'}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => navigate(`#documents:${item.id}`)}
                    style={{
                      padding: '10px 14px',
                      minHeight: 42,
                      borderRadius: 10,
                      border: '1px solid rgba(126,242,255,0.28)',
                      background: 'rgba(54, 215, 255, 0.1)',
                      color: '#effcff',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Open Packet
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        item.linkedComplianceTagIds?.length
                          ? '#compliance'
                          : item.linkedInstrumentIds?.length
                            ? '#transactions'
                            : item.sourceRecordType === 'direct_deposit_request'
                              ? '#accounting:payroll'
                              : '#accounting:dashboard',
                      )
                    }
                    style={{
                      padding: '10px 14px',
                      minHeight: 42,
                      borderRadius: 10,
                      border: '1px solid rgba(126,242,255,0.28)',
                      background: 'rgba(54, 215, 255, 0.1)',
                      color: '#effcff',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Open Next Desk
                  </button>
                </div>
              </RecordCard>
            ))
          )}
        </div>
      </PageSection>

      <PageSection
        title="Operator Hotspots"
        description="Fast routes into the desks that now have active records flowing through them."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {[
            {
              title: 'Accounting',
              subtitle: `${data.payments.length} remittances | ${data.bankFeedEntries.length} bank entries`,
              hash: '#accounting:dashboard',
            },
            {
              title: 'Remittance Intake',
              subtitle: `${data.couponPresentments.length} presentments | ${data.bills.length} bill-backed sources`,
              hash: '#accounting:presentments',
            },
            {
              title: 'Recurring',
              subtitle: `${recurringPaymentCount} payment schedules | ${recurringObligationCount} obligation cycles`,
              hash: '#accounting:recurring',
            },
            {
              title: 'Payroll',
              subtitle: `${employeeCount} workers | ${directDepositCount} direct deposit returns`,
              hash: '#accounting:payroll',
            },
            {
              title: 'Documents',
              subtitle: `${data.documents.length} vault records | ${data.tokens.length} tokens`,
              hash: '#documents',
            },
            {
              title: 'Compliance',
              subtitle: `${filingQueueCount} filing items | ${reviewItems} review items | ${amlCasesOpen} AML cases`,
              hash: '#compliance',
            },
            {
              title: 'Entities',
              subtitle: `${data.entities.length} profiles | ${data.authorityRecords.length} authority records`,
              hash: '#entities',
            },
          ].map((item) => (
            <RecordCard key={item.title} title={item.title} subtitle={item.subtitle}>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.hash = item.hash;
                  }
                }}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Open {item.title}
              </button>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Quick Launch"
        description="Direct-create the highest-traffic ERP records and setup actions from the overview."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {[
            { title: 'New Invoice', subtitle: 'Launch receivable intake', hash: '#accounting:new-invoice' },
            { title: 'Start Remittance', subtitle: 'Enter the bill or upload the coupon source first', hash: '#accounting:new-remittance' },
            { title: 'Record Payment', subtitle: 'Open the release-side payment modal directly', hash: '#accounting:new-payment' },
            { title: 'New Bill', subtitle: 'Capture AP and source file intake', hash: '#accounting:new-bill' },
            { title: 'Log Receipt', subtitle: 'Upload and extract receipt detail', hash: '#accounting:new-receipt' },
            { title: 'Present Coupon', subtitle: 'Create obligation performance presentment', hash: '#accounting:new-presentment' },
            { title: 'Add Employee', subtitle: 'Create payroll profile', hash: '#accounting:new-employee' },
            { title: 'Request Deposit Form', subtitle: 'Send direct-deposit authorization', hash: '#accounting:new-direct-deposit' },
            { title: 'Manual Bank Account', subtitle: 'Add a bank account without feed connection', hash: '#accounting:new-bank-account' },
            { title: 'Manual Bank Transaction', subtitle: 'Post a single bank movement', hash: '#accounting:new-bank-transaction' },
            { title: 'Upload Document', subtitle: 'Open vault upload flow', hash: '#documents:upload' },
            { title: 'Add Entity', subtitle: 'Create a new operating profile', hash: '#entities:new' },
          ].map((item) => (
            <RecordCard key={item.title} title={item.title} subtitle={item.subtitle}>
              <button
                type="button"
                onClick={() => navigate(item.hash)}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'rgba(54, 215, 255, 0.1)',
                  color: '#effcff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Launch
              </button>
            </RecordCard>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
