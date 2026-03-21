import type { Dispatch, SetStateAction } from 'react';
import type { CoreDataBundle } from '../../types/core';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import RecordEditorCard from '../ui/RecordEditorCard';

interface AssetsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

export default function AssetsPage({ data, setData }: AssetsPageProps) {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Assets</h1>
        <p style={{ color: '#9ca3af', marginBottom: 0 }}>
          Traditional assets, digital assets, wallets, and smart-contract positions.
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

      <PageSection title="Traditional Assets" description="Editable asset records.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.assets.map((asset) => (
            <div key={asset.id}>
              <RecordEditorCard
                title={asset.name}
                subtitle={`${asset.category} · ${asset.status}`}
                record={asset}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    assets: prev.assets.map((item) => (item.id === asset.id ? nextRecord : item)),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection title="Digital Assets" description="Editable digital asset records.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.digitalAssets.map((asset) => (
            <div key={asset.id}>
              <RecordEditorCard
                title={`${asset.name}${asset.symbol ? ` (${asset.symbol})` : ''}`}
                subtitle={`${asset.assetSubtype} · ${asset.network ?? '—'}`}
                record={asset}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    digitalAssets: prev.digitalAssets.map((item) =>
                      item.id === asset.id ? nextRecord : item
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection title="Wallets" description="Editable wallet and custody records.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.wallets.map((wallet) => (
            <div key={wallet.id}>
              <RecordEditorCard
                title={wallet.name}
                subtitle={`${wallet.network} · ${wallet.custodyType}`}
                record={wallet}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    wallets: prev.wallets.map((item) => (item.id === wallet.id ? nextRecord : item)),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection title="Smart Contract Positions" description="Editable contract position records.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.smartContractPositions.map((position) => (
            <div key={position.id}>
              <RecordEditorCard
                title={position.name}
                subtitle={`${position.network} · ${position.positionType} · ${position.status}`}
                record={position}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    smartContractPositions: prev.smartContractPositions.map((item) =>
                      item.id === position.id ? nextRecord : item
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>
    </div>
  );
}

