import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import { buildCapitalStrategySummary } from '../../services/capitalStrategy.service';
import WalletConnectionWorkspace from '../assets/WalletConnectionWorkspace';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface AssetsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function AssetsPage({ data, setData }: AssetsPageProps) {
  const marketableAssets = data.assets.filter(
    (asset) =>
      asset.marketSector === 'municipal' ||
      asset.category === 'security' ||
      Boolean(asset.identifierCode),
  );

  const marketableInstruments = data.instruments.filter(
    (instrument) =>
      instrument.marketSector === 'municipal' ||
      instrument.sourceClass === 'bond' ||
      Boolean(instrument.identifierCode),
  );

  const municipalCount =
    marketableAssets.filter((asset) => asset.marketSector === 'municipal').length +
    marketableInstruments.filter((instrument) => instrument.marketSector === 'municipal').length;
  const municipalDisclosureReviews = data.municipalDisclosures.filter(
    (item) => item.status === 'review' || item.status === 'missing' || item.status === 'stale',
  );
  const municipalEventWatchCount = data.municipalEventNotices.filter(
    (item) => item.severity === 'watch' || item.severity === 'critical' || item.status === 'open',
  ).length;
  const capitalSummary = buildCapitalStrategySummary({
    borrowingFacilities: data.borrowingFacilities,
    collateralHoldings: data.collateralHoldings,
    futuresStrategies: data.futuresStrategies,
    liquidationPlans: data.liquidationPlans,
  });

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Assets & Reserve</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Traditional assets, digital assets, treasury-linked wallets, and smart-contract positions.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Traditional Assets" value={data.assets.length} />
        <StatCard label="Marketable Paper" value={marketableAssets.length + marketableInstruments.length} />
        <StatCard label="Municipal / Fixed Income" value={municipalCount} />
        <StatCard label="Disclosure Reviews" value={municipalDisclosureReviews.length} />
        <StatCard label="Event Watch" value={municipalEventWatchCount} />
        <StatCard label="Borrowing Facilities" value={data.borrowingFacilities.length} />
        <StatCard label="Collateral Holdings" value={data.collateralHoldings.length} />
        <StatCard label="Futures Strategies" value={data.futuresStrategies.length} />
        <StatCard label="Liquidation Plans" value={data.liquidationPlans.length} />
        <StatCard label="Digital Assets" value={data.digitalAssets.length} />
        <StatCard label="Wallets" value={data.wallets.length} />
        <StatCard label="Smart Contract Positions" value={data.smartContractPositions.length} />
        <StatCard label="Assigned Tokens" value={data.tokens.length} />
      </div>

      <PageSection
        title="Capital & Liquidation Rails"
        description="Borrowing exposure, pledged collateral, futures overlays, and liquidation planning tied back into treasury and ERP cashflow."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          <StatCard label="Borrowed / Drawn" value={capitalSummary.activeBorrowingExposure.toLocaleString()} />
          <StatCard label="Borrowing Capacity" value={capitalSummary.availableBorrowingCapacity.toLocaleString()} />
          <StatCard label="Pledged Collateral" value={capitalSummary.pledgedCollateralValue.toLocaleString()} />
          <StatCard label="Coverage Value" value={capitalSummary.collateralCoverageValue.toLocaleString()} />
          <StatCard label="Futures Notional" value={capitalSummary.activeFuturesNotional.toLocaleString()} />
          <StatCard label="Futures Margin" value={capitalSummary.activeFuturesMargin.toLocaleString()} />
          <StatCard label="Liquidation Target" value={capitalSummary.liquidationTargetAmount.toLocaleString()} />
          <StatCard label="Blocked Plans" value={capitalSummary.blockedLiquidationCount} />
        </div>
      </PageSection>

      <WalletConnectionWorkspace data={data} setData={setData} />

      <PageSection
        title="Borrowing & Collateral"
        description="Facilities, collateral support, and borrowing capacity for working capital, bond purchases, and reserve-backed cashflow."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.borrowingFacilities.map((facility) => (
            <WorkbenchRecordCard
              key={facility.id}
              title={facility.facilityName}
              subtitle={`${facility.facilityType} | ${facility.status}`}
              summaryItems={[
                { label: 'Lender', value: facility.lenderName || 'Internal / not set' },
                { label: 'Commitment', value: facility.commitmentAmount.toLocaleString() },
                { label: 'Drawn', value: facility.drawnAmount.toLocaleString() },
                {
                  label: 'Available',
                  value: (facility.availableAmount ?? Math.max(0, facility.commitmentAmount - facility.drawnAmount)).toLocaleString(),
                },
                { label: 'Rate / Maturity', value: facility.interestRate ? `${facility.interestRate}% | ${facility.maturityDate || 'no maturity'}` : facility.maturityDate || 'not set' },
              ]}
              record={facility}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  borrowingFacilities: prev.borrowingFacilities.map((item) =>
                    item.id === facility.id ? nextRecord : item,
                  ),
                }))
              }
            >
              {facility.notes || facility.collateralRequirement || 'Maintain facility, lender, and collateral support details here.'}
            </WorkbenchRecordCard>
          ))}

          {data.collateralHoldings.map((holding) => (
            <WorkbenchRecordCard
              key={holding.id}
              title={holding.holdingLabel}
              subtitle={`${holding.collateralType} | ${holding.status}`}
              summaryItems={[
                { label: 'Market Value', value: holding.marketValue.toLocaleString() },
                {
                  label: 'Lendable Value',
                  value: (holding.lendableValue ?? holding.marketValue).toLocaleString(),
                },
                { label: 'Advance Rate', value: holding.advanceRate ? `${holding.advanceRate}%` : 'not set' },
                { label: 'Margin', value: holding.marginRequirement?.toLocaleString() || 'not set' },
                { label: 'Priority', value: String(holding.liquidationPriority ?? 'not set') },
              ]}
              record={holding}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  collateralHoldings: prev.collateralHoldings.map((item) =>
                    item.id === holding.id ? nextRecord : item,
                  ),
                }))
              }
            >
              {holding.notes || 'Use advanced edit to maintain pledge, margin, and liquidation priority details.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Futures & Liquidation Planning"
        description="Overlay strategies and liquidation paths that feed credits, purchases, and working-capital decisions."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.futuresStrategies.map((strategy) => (
            <WorkbenchRecordCard
              key={strategy.id}
              title={strategy.strategyName}
              subtitle={`${strategy.strategyType} | ${strategy.status} | ${strategy.positionSide}`}
              summaryItems={[
                { label: 'Underlying', value: strategy.underlyingExposure },
                { label: 'Contract', value: strategy.contractCode || strategy.contractMarket || 'not set' },
                { label: 'Notional', value: strategy.notionalExposure.toLocaleString() },
                { label: 'Margin', value: strategy.marginPosted.toLocaleString() },
                {
                  label: 'P&L',
                  value: `${(strategy.realizedPnl || 0).toLocaleString()} / ${(strategy.unrealizedPnl || 0).toLocaleString()}`,
                },
              ]}
              record={strategy}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  futuresStrategies: prev.futuresStrategies.map((item) =>
                    item.id === strategy.id ? nextRecord : item,
                  ),
                }))
              }
            >
              {strategy.notes || 'Use advanced edit to maintain hedge purpose, margin posture, and linked treasury accounts.'}
            </WorkbenchRecordCard>
          ))}

          {data.liquidationPlans.map((plan) => (
            <WorkbenchRecordCard
              key={plan.id}
              title={plan.planName}
              subtitle={`${plan.objective} | ${plan.status}`}
              summaryItems={[
                { label: 'Target', value: plan.targetAmount.toLocaleString() },
                { label: 'Projected Proceeds', value: (plan.projectedNetProceeds ?? plan.targetAmount).toLocaleString() },
                { label: 'Method', value: plan.liquidationMethod || 'manual review' },
                { label: 'Settlement Path', value: plan.settlementPathPreference || 'not set' },
                { label: 'Linked Futures', value: String(plan.linkedFuturesStrategyIds?.length || 0) },
              ]}
              record={plan}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  liquidationPlans: prev.liquidationPlans.map((item) =>
                    item.id === plan.id ? nextRecord : item,
                  ),
                }))
              }
            >
              {plan.notes || 'Use advanced edit to keep liquidation sequencing and proceeds assumptions current.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Marketable Securities & Muni Ledger"
        description="Track municipal paper, reserve bonds, identifiers, coupon and maturity data, and liquidity posture without leaving the asset desk."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {marketableAssets.length === 0 && marketableInstruments.length === 0 ? (
            <WorkbenchRecordCard title="No marketable paper tracked yet" subtitle="Add securities into the reserve ledger">
              Use identifiers, issuer details, coupon, maturity, tax treatment, and liquidity posture so reserve paper can be searched and reported cleanly.
            </WorkbenchRecordCard>
          ) : null}

          {marketableAssets.map((asset) => (
            <WorkbenchRecordCard
              key={asset.id}
              title={asset.name}
              subtitle={`${asset.marketSector || asset.category} | ${asset.taxTreatment || 'tax posture not set'}`}
              summaryItems={[
                { label: 'Identifier', value: asset.identifierCode || 'Not assigned' },
                { label: 'Issuer', value: asset.issuerName || 'Not assigned' },
                {
                  label: 'Coupon / Maturity',
                  value: asset.couponRate
                    ? `${asset.couponRate}% | ${asset.maturityDate || 'No maturity'}`
                    : asset.maturityDate || 'Not set',
                },
                { label: 'Liquidity', value: asset.liquidityProfile || 'Not reviewed' },
                { label: 'Rating', value: asset.creditRating || 'Not tracked' },
                { label: 'Market Value', value: asset.marketValue?.toLocaleString() || 'Not tracked' },
              ]}
              record={asset}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  assets: prev.assets.map((item) => (item.id === asset.id ? nextRecord : item)),
                }))
              }
              actionSlot={
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = '#aiStudio';
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(96,165,250,0.4)',
                    background: 'rgba(37,99,235,0.18)',
                    color: '#e5e7eb',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Open Muni Research
                </button>
              }
            >
              {asset.notes || 'Use advanced edit to maintain identifier, issuer, tax treatment, and liquidity review details.'}
            </WorkbenchRecordCard>
          ))}

          {marketableInstruments.map((instrument) => (
            <WorkbenchRecordCard
              key={instrument.id}
              title={instrument.title}
              subtitle={`${instrument.marketSector || instrument.sourceClass || instrument.instrumentType} | ${instrument.taxTreatment || 'tax posture not set'}`}
              summaryItems={[
                { label: 'Legal ID', value: instrument.legalIdentifier || 'Not assigned' },
                { label: 'Market ID', value: instrument.identifierCode || 'Not assigned' },
                { label: 'Issuer', value: instrument.issuerName || 'Internal / not set' },
                {
                  label: 'Coupon / Maturity',
                  value: instrument.couponRate
                    ? `${instrument.couponRate}% | ${instrument.maturityDate || 'No maturity'}`
                    : instrument.maturityDate || 'Not set',
                },
                { label: 'Liquidity', value: instrument.liquidityProfile || 'Not reviewed' },
                { label: 'Rating', value: instrument.creditRating || 'Not tracked' },
              ]}
              record={instrument}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  instruments: prev.instruments.map((item) =>
                    item.id === instrument.id ? nextRecord : item
                  ),
                }))
              }
            >
              {instrument.notes || 'Use advanced edit to maintain issuer, identifier, liquidity, and reserve posture details.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Disclosure & Event Watch"
        description="Work municipal disclosure review, EMMA follow-through, and event-notice posture directly from the asset ledger."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.municipalDisclosures.length === 0 && data.municipalEventNotices.length === 0 ? (
            <WorkbenchRecordCard
              title="No disclosure watch records yet"
              subtitle="Start municipal intake from AI Studio"
            >
              Use the CUSIP / EMMA intake tool to create disclosure review records, event-watch starters, and supporting packets for securities entering the ledger.
            </WorkbenchRecordCard>
          ) : null}

          {data.municipalDisclosures.map((disclosure) => (
            <WorkbenchRecordCard
              key={disclosure.id}
              title={`${disclosure.issuerName} disclosure`}
              subtitle={`${disclosure.disclosureType} | ${disclosure.status}`}
              summaryItems={[
                { label: 'Identifier', value: disclosure.identifierCode || 'Not assigned' },
                { label: 'EMMA', value: disclosure.emmaUrl || 'Not linked' },
                { label: 'Disclosure Date', value: disclosure.disclosureDate || 'Not tracked' },
                { label: 'Filed', value: disclosure.filingDate || 'Pending review' },
              ]}
              record={disclosure}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  municipalDisclosures: prev.municipalDisclosures.map((item) =>
                    item.id === disclosure.id ? nextRecord : item,
                  ),
                }))
              }
              actionSlot={
                disclosure.emmaUrl ? (
                  <a
                    href={disclosure.emmaUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(96,165,250,0.4)',
                      background: 'rgba(37,99,235,0.18)',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      fontWeight: 700,
                    }}
                  >
                    Open EMMA
                  </a>
                ) : undefined
              }
            >
              {disclosure.notes ||
                'Use advanced edit to maintain filing posture, linked issuer documents, and municipal disclosure review notes.'}
            </WorkbenchRecordCard>
          ))}

          {data.municipalEventNotices.map((notice) => (
            <WorkbenchRecordCard
              key={notice.id}
              title={`${notice.issuerName} event notice`}
              subtitle={`${notice.eventType} | ${notice.severity} | ${notice.status}`}
              summaryItems={[
                { label: 'Identifier', value: notice.identifierCode || 'Not assigned' },
                { label: 'EMMA', value: notice.emmaUrl || 'Not linked' },
                { label: 'Event Date', value: notice.eventDate || 'Not tracked' },
                { label: 'Linked Docs', value: `${notice.linkedDocumentIds?.length || 0}` },
              ]}
              record={notice}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  municipalEventNotices: prev.municipalEventNotices.map((item) =>
                    item.id === notice.id ? nextRecord : item,
                  ),
                }))
              }
              actionSlot={
                notice.emmaUrl ? (
                  <a
                    href={notice.emmaUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(96,165,250,0.4)',
                      background: 'rgba(37,99,235,0.18)',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      fontWeight: 700,
                    }}
                  >
                    Review Notice
                  </a>
                ) : undefined
              }
            >
              {notice.notes ||
                'Use advanced edit to keep event notices, severity posture, and supporting disclosure links current.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Security Source Search"
        description="Launch research sources for municipal, Treasury, and broader fixed-income/security intake before posting a holding into the ledger."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {[
            { label: 'MSRB EMMA', url: 'https://emma.msrb.org/' },
            { label: 'SEC EDGAR', url: 'https://www.sec.gov/edgar/search/' },
            { label: 'OpenFIGI', url: 'https://www.openfigi.com/search' },
            { label: 'TreasuryDirect', url: 'https://www.treasurydirect.gov/marketable-securities/' },
            { label: 'FINRA Fixed Income', url: 'https://www.finra.org/finra-data/fixed-income' },
          ].map((source) => (
            <a
              key={source.label}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px solid rgba(126, 242, 255, 0.16)',
                background: 'rgba(10, 22, 35, 0.72)',
                color: '#e5e7eb',
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >
              <span>{source.label}</span>
              <span style={{ color: 'var(--cf-muted)' }}>Open</span>
            </a>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Traditional Assets"
        description="Property, receivables, reserve positions, and operating assets without raw record dumps."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.assets.map((asset) => (
            <WorkbenchRecordCard
              key={asset.id}
              title={asset.name}
              subtitle={`${asset.category} | ${asset.status}`}
              summaryItems={[
                {
                  label: 'Entity',
                  value:
                    data.entities.find((item) => item.id === asset.entityId)?.displayName ||
                    asset.entityId,
                },
                { label: 'Book Value', value: asset.bookValue.toLocaleString() },
                { label: 'Market Value', value: asset.marketValue?.toLocaleString() || 'Not tracked' },
                { label: 'Payment Medium', value: asset.paymentMedium || 'Not assigned' },
                {
                  label: 'Identifier / Liquidity',
                  value:
                    asset.identifierCode || asset.liquidityProfile
                      ? `${asset.identifierCode || 'No ID'} | ${asset.liquidityProfile || 'No liquidity review'}`
                      : 'General asset',
                },
              ]}
              record={asset}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  assets: prev.assets.map((item) => (item.id === asset.id ? nextRecord : item)),
                }))
              }
            >
              {asset.notes ||
                'Use advanced edit for linked ledgers, document support, and compliance tags.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Digital Assets"
        description="Wallet-held positions, payment tokens, tokenized instruments, and chain-linked holdings."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.digitalAssets.map((asset) => (
            <WorkbenchRecordCard
              key={asset.id}
              title={`${asset.name}${asset.symbol ? ` (${asset.symbol})` : ''}`}
              subtitle={`${asset.assetSubtype} | ${asset.network ?? 'Network not set'}`}
              summaryItems={[
                { label: 'Quantity', value: asset.quantity.toLocaleString() },
                { label: 'Estimated Value', value: asset.estimatedValue.toLocaleString() },
                { label: 'Classification', value: asset.classification },
                { label: 'Custody', value: `${asset.custodyStatus} / ${asset.complianceStatus}` },
                {
                  label: 'Execution',
                  value: asset.contractAddress
                    ? `${asset.symbol || asset.name} contract ready`
                    : 'Native or manual asset flow',
                },
              ]}
              record={asset}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  digitalAssets: prev.digitalAssets.map((item) =>
                    item.id === asset.id ? nextRecord : item
                  ),
                }))
              }
              actionSlot={
                asset.explorerUrl ? (
                  <a
                    href={asset.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(96,165,250,0.4)',
                      background: 'rgba(37,99,235,0.18)',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                      textDecoration: 'none',
                    }}
                  >
                    Explorer
                  </a>
                ) : undefined
              }
            >
              {asset.linkedTokenIds?.length
                ? `Linked verification tokens: ${asset.linkedTokenIds.join(', ')}`
                : 'Use advanced edit for token references, linked documents, and ledger mapping.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Wallets"
        description="Connected custody records with treasury and ledger linkage."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.wallets.map((wallet) => (
            <WorkbenchRecordCard
              key={wallet.id}
              title={wallet.name}
              subtitle={`${wallet.network} | ${wallet.custodyType} | ${wallet.connectionStatus || 'connected'}`}
              summaryItems={[
                { label: 'Address', value: wallet.address },
                { label: 'Provider', value: wallet.connectionProvider || 'manual' },
                { label: 'Native Asset', value: wallet.nativeAssetSymbol || 'Not set' },
                { label: 'Last Sync', value: wallet.lastSyncAt?.slice(0, 10) || 'Not synced yet' },
              ]}
              record={wallet}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  wallets: prev.wallets.map((item) => (item.id === wallet.id ? nextRecord : item)),
                }))
              }
            >
              {wallet.linkedTreasuryAccountId || wallet.linkedLedgerAccountId
                ? `Linked treasury: ${wallet.linkedTreasuryAccountId || 'none'} | linked ledger: ${wallet.linkedLedgerAccountId || 'none'}`
                : 'Use advanced edit to attach this wallet to treasury or ledger execution.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Smart Contract Positions"
        description="Escrow, staking, vault, and tokenized instrument positions tied back to treasury controls."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.smartContractPositions.map((position) => (
            <WorkbenchRecordCard
              key={position.id}
              title={position.name}
              subtitle={`${position.network} | ${position.positionType} | ${position.status}`}
              summaryItems={[
                { label: 'Protocol', value: position.protocolName || 'Internal' },
                { label: 'Estimated Value', value: position.estimatedValue?.toLocaleString() || 'Not tracked' },
                { label: 'Wallet', value: position.walletId || 'No wallet linked' },
                { label: 'Contract', value: position.contractAddress || 'No address set' },
              ]}
              record={position}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  smartContractPositions: prev.smartContractPositions.map((item) =>
                    item.id === position.id ? nextRecord : item
                  ),
                }))
              }
            >
              {position.linkedTokenIds?.length
                ? `Verification tokens linked: ${position.linkedTokenIds.join(', ')}`
                : 'Use advanced edit to attach control tokens and source documents.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
