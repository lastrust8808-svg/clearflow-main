import { useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type {
  CoreDataBundle,
  LedgerAccountRecord,
  WalletConnectionProvider,
  WalletRecord,
} from '../../types/core';
import PageSection from '../ui/PageSection';
import {
  connectDigitalWallet,
  syncConnectedWallet,
} from '../../services/walletConnection.service';
import {
  buildWalletActionSummary,
  getWalletProviderResource,
  listWalletProviderResources,
} from '../../services/walletResourceCatalog.service';

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

function buildWalletLedgerAccount(input: {
  wallet: WalletRecord;
  existingLedgerAccounts: LedgerAccountRecord[];
  currency: string;
}) {
  const matchedExisting =
    input.existingLedgerAccounts.find((account) =>
      account.linkedWalletIds?.includes(input.wallet.id)
    ) ||
    input.existingLedgerAccounts.find(
      (account) =>
        account.entityId === input.wallet.entityId &&
        account.name === `${input.wallet.name} Digital Asset Custody`
    );

  if (matchedExisting) {
    return matchedExisting;
  }

  return {
    id: `led-wallet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityId: input.wallet.entityId,
    code: `115${String((input.existingLedgerAccounts.length % 90) + 10).padStart(2, '0')}`,
    name: `${input.wallet.name} Digital Asset Custody`,
    accountType: 'asset' as const,
    currency: input.currency,
    balance: 0,
    remittanceEligible: false,
    remittanceClassification: 'other' as const,
    linkedWalletIds: [input.wallet.id],
  };
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
      evmReady: data.wallets.filter((wallet) =>
        ['ethereum', 'base', 'polygon'].some((label) =>
          wallet.network.toLowerCase().includes(label)
        )
      ).length,
      liveBroadcast: data.wallets.filter((wallet) => wallet.executionSupport === 'live_broadcast').length,
    }),
    [data.wallets]
  );
  const providerResources = useMemo(() => listWalletProviderResources(), []);
  const selectedProviderResource = useMemo(
    () => getWalletProviderResource(provider),
    [provider]
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
        ...(() => {
          const generatedLedgerAccount = result.wallet.linkedLedgerAccountId
            ? prev.ledgerAccounts.find((account) => account.id === result.wallet.linkedLedgerAccountId)
            : buildWalletLedgerAccount({
                wallet: result.wallet,
                existingLedgerAccounts: prev.ledgerAccounts,
                currency: prev.workspaceSettings.baseCurrency,
              });
          const resolvedWallet =
            generatedLedgerAccount && result.wallet.linkedLedgerAccountId !== generatedLedgerAccount.id
              ? {
                  ...result.wallet,
                  linkedLedgerAccountId: generatedLedgerAccount.id,
                }
              : result.wallet;
          const shouldAddLedgerAccount = generatedLedgerAccount
            ? !prev.ledgerAccounts.some((account) => account.id === generatedLedgerAccount.id)
            : false;

          return {
        ...prev,
            wallets: upsertRecord(prev.wallets, resolvedWallet),
            ledgerAccounts:
              generatedLedgerAccount && shouldAddLedgerAccount
                ? [generatedLedgerAccount, ...prev.ledgerAccounts]
                : prev.ledgerAccounts.map((account) =>
                    account.id === generatedLedgerAccount?.id
                      ? {
                          ...account,
                          linkedWalletIds: Array.from(
                            new Set([...(account.linkedWalletIds ?? []), resolvedWallet.id])
                          ),
                        }
                      : account
                  ),
          };
        })(),
      }));
      setStatusMessage(
        `${result.notice} A linked digital-asset custody account was added to the chart of accounts so the wallet is available in accounting flows.`
      );
      resetForm();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSyncWallet = (wallet: WalletRecord) => {
    setData((prev) => {
      const generatedLedgerAccount = wallet.linkedLedgerAccountId
        ? prev.ledgerAccounts.find((account) => account.id === wallet.linkedLedgerAccountId)
        : buildWalletLedgerAccount({
            wallet,
            existingLedgerAccounts: prev.ledgerAccounts,
            currency: prev.workspaceSettings.baseCurrency,
          });
      const resolvedWallet =
        generatedLedgerAccount && wallet.linkedLedgerAccountId !== generatedLedgerAccount.id
          ? {
              ...wallet,
              linkedLedgerAccountId: generatedLedgerAccount.id,
            }
          : wallet;
      const treasuryAccount = wallet.linkedTreasuryAccountId
        ? prev.treasuryAccounts.find((account) => account.id === wallet.linkedTreasuryAccountId)
        : undefined;
      const linkedLedger = resolvedWallet.linkedLedgerAccountId
        ? prev.ledgerAccounts.find((account) => account.id === resolvedWallet.linkedLedgerAccountId)
        : undefined;
      const syncResult = syncConnectedWallet({
        wallet: resolvedWallet,
        existingDigitalAssets: prev.digitalAssets,
        existingOnChainTransactions: prev.onChainTransactions,
        treasuryAccount,
        linkedLedgerAccountLabel: linkedLedger
          ? `${linkedLedger.code} ${linkedLedger.name}`
          : undefined,
      });

      return {
        ...prev,
        ledgerAccounts:
          generatedLedgerAccount && !prev.ledgerAccounts.some((account) => account.id === generatedLedgerAccount.id)
            ? [generatedLedgerAccount, ...prev.ledgerAccounts]
            : prev.ledgerAccounts.map((account) =>
                account.id === generatedLedgerAccount?.id
                  ? {
                      ...account,
                      linkedWalletIds: Array.from(
                        new Set([...(account.linkedWalletIds ?? []), resolvedWallet.id])
                      ),
                    }
                  : account
              ),
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
      `${wallet.name} synced. The imported on-chain movement is now reflected in digital assets, transactions, settlements, journals, and the linked chart of accounts record.`
    );
  };

  return (
    <PageSection
      title="Connect Digital Wallets & Trading Accounts"
      description="Link custody wallets and exchange-style crypto accounts to treasury and ledger accounts, then sync digital asset activity into transactions, settlements, and accounting journals."
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
          <div style={statTileStyle}>
            <span style={{ fontSize: 12, color: '#7dd3fc', textTransform: 'uppercase' }}>
              EVM Ready
            </span>
            <strong style={{ fontSize: 24 }}>{walletCounts.evmReady}</strong>
          </div>
          <div style={statTileStyle}>
            <span style={{ fontSize: 12, color: '#7dd3fc', textTransform: 'uppercase' }}>
              Live Broadcast
            </span>
            <strong style={{ fontSize: 24 }}>{walletCounts.liveBroadcast}</strong>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>New wallet or trading connection</div>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.18)',
              background: 'rgba(15,23,42,0.22)',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ color: '#f8fafc', fontWeight: 700 }}>{selectedProviderResource.label}</div>
            <div style={{ color: '#cbd5e1', fontSize: 13 }}>{selectedProviderResource.bestFor}</div>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>
              Rail class: {selectedProviderResource.railClass.replace('_', ' ')} | Execution:{' '}
              {selectedProviderResource.executionSupport.replace('_', ' ')}
            </div>
          </div>

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
              <option value="coinbase_exchange">Coinbase Exchange</option>
              <option value="kraken">Kraken</option>
              <option value="binance_us">Binance.US</option>
              <option value="robinhood_crypto">Robinhood Crypto</option>
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
              Injected EVM wallets can move into live broadcast mode. Exchange and trading-account profiles keep custody, proof, reserve tracking, and controlled release tied into the ledger even before direct API sync is turned on.
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
            }}
          >
            {selectedProviderResource.nextSteps.map((step) => (
              <div
                key={step}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(56,189,248,0.2)',
                  background: 'rgba(8,145,178,0.1)',
                  color: '#cffafe',
                  fontSize: 12,
                }}
              >
                {step}
              </div>
            ))}
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
          {data.wallets.map((wallet) => {
            const walletActionSummary = buildWalletActionSummary(wallet);
            return (
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
                      {wallet.network} · {wallet.custodyType} · {walletActionSummary.providerLabel}
                    </span>
                    <span style={{ color: '#cbd5e1', fontSize: 12 }}>{wallet.address}</span>
                    <span style={{ color: '#7dd3fc', fontSize: 12 }}>{walletActionSummary.nextAction}</span>
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
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '1px solid rgba(148,163,184,0.16)',
                      background: 'rgba(15,23,42,0.22)',
                      color: '#cbd5e1',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ color: '#f8fafc', fontWeight: 700, marginBottom: 6 }}>
                      Best Use
                    </div>
                    {walletActionSummary.bestFor}
                  </div>
                  {walletActionSummary.explorer ? (
                    <a
                      href={`${walletActionSummary.explorer.explorerUrl}address/${wallet.address}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: '1px solid rgba(45,212,191,0.2)',
                        background: 'rgba(6,78,59,0.16)',
                        color: '#d1fae5',
                        fontSize: 12,
                        textDecoration: 'none',
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>
                        Open in {walletActionSummary.explorer.explorerLabel}
                      </span>
                      <span>Review the live address trail and on-chain proof history.</span>
                    </a>
                  ) : null}
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
                  <div style={{ color: '#cbd5e1', fontSize: 13 }}>
                    Execution: {wallet.executionSupport || 'manual_release'}
                  </div>
                </div>

                <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6 }}>
                  {wallet.executionNotes || 'Wallet execution details will appear here as support expands.'}
                </div>
              </div>
            );
          })}
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Connection resources</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {providerResources.map((resource) => (
              <div
                key={resource.provider}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: '1px solid rgba(148,163,184,0.18)',
                  background: 'rgba(15,23,42,0.26)',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ color: '#f8fafc', fontWeight: 700 }}>{resource.label}</div>
                <div style={{ color: '#cbd5e1', fontSize: 12 }}>{resource.bestFor}</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>
                  {resource.railClass.replace('_', ' ')} | {resource.executionSupport.replace('_', ' ')}
                </div>
                {resource.resourceLinks.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#67e8f9', fontSize: 12, textDecoration: 'none' }}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageSection>
  );
}
