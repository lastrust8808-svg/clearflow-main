import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import WalletConnectionWorkspace from '../assets/WalletConnectionWorkspace';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface AssetsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function AssetsPage({ data, setData }: AssetsPageProps) {
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
        <StatCard label="Digital Assets" value={data.digitalAssets.length} />
        <StatCard label="Wallets" value={data.wallets.length} />
        <StatCard label="Smart Contract Positions" value={data.smartContractPositions.length} />
        <StatCard label="Assigned Tokens" value={data.tokens.length} />
      </div>

      <WalletConnectionWorkspace data={data} setData={setData} />

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
