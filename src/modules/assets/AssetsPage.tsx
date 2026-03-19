import React, { useMemo, useState } from 'react';
import { useCoreData } from '../../hooks/useCoreData';

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 16,
};

const money = (value?: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value ?? 0);

export default function AssetsPage() {
  const { assets, entities } = useCoreData();
  const [filter, setFilter] = useState<'all' | 'digital' | 'private_note' | 'metal' | 'real_estate'>('all');

  const entityNameById = useMemo(
    () => Object.fromEntries(entities.map((entity) => [entity.id, entity.name])),
    [entities]
  );

  const filteredAssets = useMemo(() => {
    if (filter === 'all') return assets;
    return assets.filter((asset) => asset.assetClass === filter);
  }, [assets, filter]);

  const totals = useMemo(() => {
    return filteredAssets.reduce(
      (acc, asset) => {
        acc.market += asset.marketValue ?? asset.estimatedValue ?? 0;
        acc.liquidation += asset.liquidationValue ?? 0;
        acc.immediate += asset.immediateCashValue ?? 0;
        return acc;
      },
      { market: 0, liquidation: 0, immediate: 0 }
    );
  }, [filteredAssets]);

  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Assets Registry</div>
        <div style={{ opacity: 0.72 }}>
          Traditional, private, and digital assets with liquidity and cash-value tracking.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {(['all', 'digital', 'private_note', 'metal', 'real_estate'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              background: filter === key ? '#2563eb' : 'rgba(255,255,255,0.06)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 999,
              padding: '10px 14px',
              cursor: 'pointer',
            }}
          >
            {key}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={cardStyle}>
          <div style={{ opacity: 0.7, marginBottom: 6 }}>Filtered Assets</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{filteredAssets.length}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ opacity: 0.7, marginBottom: 6 }}>Market Value</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{money(totals.market)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ opacity: 0.7, marginBottom: 6 }}>Liquidation Value</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{money(totals.liquidation)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ opacity: 0.7, marginBottom: 6 }}>Immediate Cash Value</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{money(totals.immediate)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {filteredAssets.map((asset) => (
          <div key={asset.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{asset.name}</div>
                <div style={{ opacity: 0.7, marginTop: 4 }}>
                  {asset.assetClass}
                  {asset.assetSubtype ? ` • ${asset.assetSubtype}` : ''}
                  {' • '}
                  {entityNameById[asset.entityId] ?? asset.entityId}
                </div>
              </div>
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: 'rgba(37,99,235,0.18)',
                  border: '1px solid rgba(37,99,235,0.35)',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                }}
              >
                {asset.liquidityClass}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                marginTop: 16,
              }}
            >
              <div>
                <div style={{ opacity: 0.65, fontSize: 12 }}>Book Value</div>
                <div style={{ fontWeight: 700 }}>{money(asset.bookValue)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.65, fontSize: 12 }}>Market Value</div>
                <div style={{ fontWeight: 700 }}>{money(asset.marketValue ?? asset.estimatedValue)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.65, fontSize: 12 }}>Liquidation Value</div>
                <div style={{ fontWeight: 700 }}>{money(asset.liquidationValue)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.65, fontSize: 12 }}>Immediate Cash Value</div>
                <div style={{ fontWeight: 700 }}>{money(asset.immediateCashValue)}</div>
              </div>
              <div>
                <div style={{ opacity: 0.65, fontSize: 12 }}>Disposition</div>
                <div style={{ fontWeight: 700 }}>{asset.dispositionStatus ?? 'held'}</div>
              </div>
              <div>
                <div style={{ opacity: 0.65, fontSize: 12 }}>Payment Medium</div>
                <div style={{ fontWeight: 700 }}>{asset.paymentMedium ?? 'n/a'}</div>
              </div>
              <div>
                <div style={{ opacity: 0.65, fontSize: 12 }}>Obligation Type</div>
                <div style={{ fontWeight: 700 }}>{asset.obligationType ?? 'n/a'}</div>
              </div>
              <div>
                <div style={{ opacity: 0.65, fontSize: 12 }}>Days to Liquidate</div>
                <div style={{ fontWeight: 700 }}>{asset.daysToLiquidate ?? '-'}</div>
              </div>
            </div>

            {(asset.description || asset.encumbranceNotes || asset.explorerUrl) && (
              <div style={{ marginTop: 14, opacity: 0.78, lineHeight: 1.5 }}>
                {asset.description && <div>{asset.description}</div>}
                {asset.encumbranceNotes && <div>Encumbrance: {asset.encumbranceNotes}</div>}
                {asset.explorerUrl && (
                  <div style={{ marginTop: 6 }}>
                    Explorer: <span style={{ color: '#93c5fd' }}>{asset.explorerUrl}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
