import type { CoreDataBundle } from '../../types/core';
import { buildSettlementFlowViews } from '../../services/settlementAnalytics.service';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import RecordCard from '../ui/RecordCard';

interface OverviewPageProps {
  data: CoreDataBundle;
}

export default function OverviewPage({ data }: OverviewPageProps) {
  const settlementFlows = buildSettlementFlowViews(data);
  const totalAssetBookValue = data.assets.reduce((sum, item) => sum + item.bookValue, 0);
  const totalDigitalEstimatedValue = data.digitalAssets.reduce(
    (sum, item) => sum + item.estimatedValue,
    0
  );
  const settlementReviewItems = settlementFlows.filter(
    (item) =>
      item.hasCoverageGap ||
      item.derivedAutoReconcileStatus !== 'matched' ||
      !item.verificationReady
  ).length;
  const liquidCashReadyCount = settlementFlows.filter((item) => item.liquidCashReady).length;
  const autoReconciledCount = settlementFlows.filter(
    (item) => item.derivedAutoReconcileStatus === 'matched'
  ).length;
  const reviewItems = [
    ...data.complianceTags.filter((item) => item.status === 'review'),
    ...data.digitalAssetCompliance.filter(
      (item) => item.sourceOfFundsRecordStatus !== 'complete'
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
        <StatCard label="Liquid Cash Ready" value={liquidCashReadyCount} />
        <StatCard label="Auto Reconciled" value={autoReconciledCount} />
        <StatCard label="Review Items" value={reviewItems} />
      </div>

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
            title="Document Vault Linking"
            subtitle="Control memos, issuance packets, reserve files, authority records"
          >
            <div style={{ color: '#d1d5db', lineHeight: 1.7 }}>
              Records can be tied to assets, wallets, instruments, transactions, and compliance
              flags without splitting systems apart.
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
    </div>
  );
}
