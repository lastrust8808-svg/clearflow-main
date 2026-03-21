import { useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type {
  CoreDataBundle,
  WalletConnectionProvider,
  WalletRecord,
} from '../../types/core';
import PageSection from '../ui/PageSection';
import {
  connectDigitalWallet,
  syncConnectedWallet,
} from '../../services/walletConnection.service';

interface WalletConnectionWorkspaceProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.24)',
  background: 'rgba(15,23,42,0.48)',
  color: '#e2e8f0',
  boxSizing: 'border-box',
};

const buttonStyle: CSSProperties = {
  minHeight: 44,
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid rgba(56,189,248,0.3)',
  background: 'rgba(8,145,178,0.18)',
  color: '#ecfeff',
  cursor: 'pointer',
  fontWeight: 700,
};

const statTileStyle: CSSProperties = {
  padding: 14,
  borderRadius: 14,
  border: '1px solid rgba(45,212,191,0.18)',
  background: 'rgba(6,78,89,0.18)',
  display: 'grid',
  gap: 4,
};

const cardStyle: CSSProperties = {
  padding: 16,
  borderRadius: 16,
  border: '1px solid rgba(148,163,184,0.18)',
  background: 'rgba(15,23,42,0.38)',
  display: 'grid',
  gap: 12,
};

function upsertRecord<T extends { id: string }>(collection: T[], nextRecord: T) {
  const existing = collection.find((record) => record.id === nextRecord.id);
  if (!existing) {
    return [nextRecord, ...collection];
  }

  return collection.map((record) => (record.id === nextRecord.id ? nextRecord : record));
}

export default function WalletConnectionWorkspace({
  data,
  setData,
}: WalletConnectionWorkspaceProps) {
  const [provider, setProvider] = useState<WalletConnectionProvider>('metamask');
  const [walletName, setWalletName] = useState('');
  const [network, setNetwork] = useState('Ethereum');
  const [manualAddress, setManualAddress] = useState('');
  const [linkedTreasuryAccountId, setLinkedTreasuryAccountId] = useState('');
  const [linkedLedgerAccountId, setLinkedLedgerAccountId] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const primaryEntity = data.entities[0];
  const treasuryOptions = useMemo(
    () =>
      data.treasuryAccounts.filter(
        (account) =>
          account.entityId === primaryEntity?.id &&
          account.status === 'active' &&
          account.remittanceEnabled
      ),
    [data.treasuryAccounts, primaryEntity?.id]
  );
  const ledgerOptions = useMemo(
    () => data.ledgerAccounts.filter((account) => account.entityId === primaryEntity?.id),
    [data.ledgerAccounts, primaryEntity?.id]
  );
  const walletCounts = useMemo(
    () => ({
      connected: data.wallets.filter((wallet) => wallet.connectionStatus === 'connected').length,
      syncing: data.wallets.filter((wallet) => wallet.connectionStatus === 'syncing').length,
      treasuryLinked: data.wallets.filter((wallet) => wallet.linkedTreasuryAccountId).length,
    }),
    [data.wallets]
  );

  const resetForm = () => {
    setWalletName('');
    setManualAddress('');
    setLinkedTreasuryAccountId('');
    setLinkedLedgerAccountId('');
  };

  const handleConnect = async () => {
    if (!primaryEntity) {
      setStatusMessage('Create an entity first so the wallet can be assigned to a treasury owner.');
      return;
    }

    setIsConnecting(true);
    try {
      const result = await connectDigitalWallet({
        entityId: primaryEntity.id,
        provider,
        network,
        walletName,
        manualAddress,
        linkedTreasuryAccountId: linkedTreasuryAccountId || undefined,
        linkedLedgerAccountId: linkedLedgerAccountId || undefined,
      });

      setData((prev) => ({
        ...prev,
        wallets: upsertRecord(prev.wallets, result.wallet),
      }));
      setStatusMessage(result.notice);
      resetForm();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSyncWallet = (wallet: WalletRecord) => {
    setData((prev) => {
      const treasuryAccount = wallet.linkedTreasuryAccountId
        ? prev.treasuryAccounts.find((account) => account.id === wallet.linkedTreasuryAccountId)
        : undefined;
      const linkedLedger = wallet.linkedLedgerAccountId
        ? prev.ledgerAccounts.find((account) => account.id === wallet.linkedLedgerAccountId)
        : undefined;
      const syncResult = syncConnectedWallet({
        wallet,
        existingDigitalAssets: prev.digitalAssets,
        existingOnChainTransactions: prev.onChainTransactions,
        treasuryAccount,
        linkedLedgerAccountLabel: linkedLedger
          ? `${linkedLedger.code} ${linkedLedger.name}`
          : undefined,
      });

      return {
        ...prev,
        wallets: prev.wallets.map((record) =>
          record.id === wallet.id ? syncResult.wallet : record
        ),
        digitalAssets: upsertRecord(prev.digitalAssets, syncResult.digitalAsset),
        onChainTransactions: [syncResult.onChainTransaction, ...prev.onChainTransactions],
        transactions: [syncResult.transaction, ...prev.transactions],
        settlements: [syncResult.settlement, ...prev.settlements],
        journalEntries: [syncResult.journalEntry, ...prev.journalEntries],
        treasuryAccounts: syncResult.updatedTreasuryAccount
          ? prev.treasuryAccounts.map((account) =>
              account.id === syncResult.updatedTreasuryAccount?.id
                ? syncResult.updatedTreasuryAccount
                : account
            )
          : prev.treasuryAccounts,
        smartContractPositions: syncResult.smartContractPosition
          ? upsertRecord(prev.smartContractPositions, syncResult.smartContractPosition)
          : prev.smartContractPositions,
      };
    });

    setStatusMessage(
      `${wallet.name} synced. The imported on-chain movement is now reflected in digital assets, transactions, settlements, and journals.`
    );
  };

  return (
    <PageSection
      title="Connect Digital Wallet"
      description="Link custody wallets to treasury and ledger accounts, then sync digital asset activity into transactions, settlements, and accounting journals."
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          <div style={statTileStyle}>
            <span style={{ fontSize: 12, color: '#7dd3fc', textTransform: 'uppercase' }}>
              Connected
            </span>
            <strong style={{ fontSize: 24 }}>{walletCounts.connected}</strong>
          </div>
          <div style={statTileStyle}>
            <span style={{ fontSize: 12, color: '#7dd3fc', textTransform: 'uppercase' }}>
              Treasury Linked
            </span>
            <strong style={{ fontSize: 24 }}>{walletCounts.treasuryLinked}</strong>
          </div>
          <div style={statTileStyle}>
            <span style={{ fontSize: 12, color: '#7dd3fc', textTransform: 'uppercase' }}>
              Syncing
            </span>
            <strong style={{ fontSize: 24 }}>{walletCounts.syncing}</strong>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>New wallet connection</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <select
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as WalletConnectionProvider)
              }
              style={inputStyle}
            >
              <option value="metamask">MetaMask</option>
              <option value="coinbase">Coinbase Wallet</option>
              <option value="walletconnect">WalletConnect</option>
              <option value="manual">Manual custody record</option>
            </select>
            <select
              value={network}
              onChange={(event) => setNetwork(event.target.value)}
              style={inputStyle}
            >
              <option value="Ethereum">Ethereum</option>
              <option value="Bitcoin">Bitcoin</option>
              <option value="Base">Base</option>
              <option value="Polygon">Polygon</option>
              <option value="Solana">Solana</option>
            </select>
            <input
              value={walletName}
              onChange={(event) => setWalletName(event.target.value)}
              placeholder="Wallet name"
              style={inputStyle}
            />
            <input
              value={manualAddress}
              onChange={(event) => setManualAddress(event.target.value)}
              placeholder="Wallet address (optional if injected)"
              style={inputStyle}
            />
            <select
              value={linkedTreasuryAccountId}
              onChange={(event) => setLinkedTreasuryAccountId(event.target.value)}
              style={inputStyle}
            >
              <option value="">Link treasury account</option>
              {treasuryOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} - {account.treasuryType}
                </option>
              ))}
            </select>
            <select
              value={linkedLedgerAccountId}
              onChange={(event) => setLinkedLedgerAccountId(event.target.value)}
              style={inputStyle}
            >
              <option value="">Link ledger account</option>
              {ledgerOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={handleConnect} style={buttonStyle} disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
            <span style={{ color: '#cbd5e1', fontSize: 13 }}>
              Injected EVM wallets will be requested in-browser when available. Other providers can be tracked as custody records now and upgraded later.
            </span>
          </div>
        </div>

        {statusMessage ? (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(45,212,191,0.25)',
              background: 'rgba(15,118,110,0.16)',
              color: '#d1fae5',
              fontSize: 13,
            }}
          >
            {statusMessage}
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: 12 }}>
          {data.wallets.map((wallet) => (
            <div key={wallet.id} style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'grid', gap: 4 }}>
                  <strong style={{ fontSize: 16 }}>{wallet.name}</strong>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>
                    {wallet.network} · {wallet.custodyType} · {wallet.connectionProvider || 'manual'}
                  </span>
                  <span style={{ color: '#cbd5e1', fontSize: 12 }}>{wallet.address}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSyncWallet(wallet)}
                  style={buttonStyle}
                >
                  Sync Wallet Activity
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                }}
              >
                <div style={{ color: '#cbd5e1', fontSize: 13 }}>
                  Status: {wallet.connectionStatus || 'connected'}
                </div>
                <div style={{ color: '#cbd5e1', fontSize: 13 }}>
                  Treasury: {wallet.linkedTreasuryAccountId || 'Not linked'}
                </div>
                <div style={{ color: '#cbd5e1', fontSize: 13 }}>
                  Ledger: {wallet.linkedLedgerAccountId || 'Not linked'}
                </div>
                <div style={{ color: '#cbd5e1', fontSize: 13 }}>
                  Last sync: {wallet.lastSyncAt ? new Date(wallet.lastSyncAt).toLocaleString() : 'Never'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageSection>
  );
}
