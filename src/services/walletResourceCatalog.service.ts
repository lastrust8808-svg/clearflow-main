import type {
  WalletConnectionProvider,
  WalletExecutionSupport,
  WalletRecord,
} from '../types/core';

export interface WalletProviderResource {
  provider: WalletConnectionProvider;
  label: string;
  railClass: 'self_custody' | 'exchange' | 'aggregated' | 'manual';
  executionSupport: WalletExecutionSupport;
  bestFor: string;
  nextSteps: string[];
  resourceLinks: Array<{ label: string; url: string }>;
}

export interface WalletNetworkResource {
  network: string;
  explorerLabel: string;
  explorerUrl: string;
  actionHints: string[];
}

const providerResources: Record<WalletConnectionProvider, WalletProviderResource> = {
  metamask: {
    provider: 'metamask',
    label: 'MetaMask',
    railClass: 'self_custody',
    executionSupport: 'live_broadcast',
    bestFor: 'Direct EVM treasury control, signer-confirmed payouts, and contract activity.',
    nextSteps: [
      'Connect the wallet to the active entity treasury.',
      'Link a ledger account so imported activity posts cleanly.',
      'Use sync after funding or payout movement to keep ERP and settlements current.',
    ],
    resourceLinks: [{ label: 'MetaMask', url: 'https://metamask.io/' }],
  },
  coinbase: {
    provider: 'coinbase',
    label: 'Coinbase Wallet',
    railClass: 'self_custody',
    executionSupport: 'live_broadcast',
    bestFor: 'Mobile-friendly EVM wallet control with signer-based release.',
    nextSteps: [
      'Connect to an EVM network wallet.',
      'Use for signer-confirmed outgoing wallet transfers where vendor wallet data exists.',
      'Keep a linked treasury/ledger account for accounting continuity.',
    ],
    resourceLinks: [{ label: 'Coinbase Wallet', url: 'https://www.coinbase.com/wallet' }],
  },
  walletconnect: {
    provider: 'walletconnect',
    label: 'WalletConnect',
    railClass: 'aggregated',
    executionSupport: 'manual_release',
    bestFor: 'Wallet session bridging when direct injected execution is not available.',
    nextSteps: [
      'Use as a custody/session record first.',
      'Keep outward release staged until the connected wallet confirms.',
      'Sync imported asset movement back into treasury and journals.',
    ],
    resourceLinks: [{ label: 'WalletConnect', url: 'https://walletconnect.network/' }],
  },
  coinbase_exchange: {
    provider: 'coinbase_exchange',
    label: 'Coinbase Exchange',
    railClass: 'exchange',
    executionSupport: 'manual_release',
    bestFor: 'Exchange custody, trading inventory, and controlled liquidation posture.',
    nextSteps: [
      'Record the exchange account as controlled custody.',
      'Use sync and manual release notes for treasury conversions or withdrawals.',
      'Tie liquidations back to collateral, reserve, or remittance plans.',
    ],
    resourceLinks: [{ label: 'Coinbase Exchange', url: 'https://www.coinbase.com/advanced-trade' }],
  },
  kraken: {
    provider: 'kraken',
    label: 'Kraken',
    railClass: 'exchange',
    executionSupport: 'manual_release',
    bestFor: 'Exchange custody with controlled release and imported trading posture.',
    nextSteps: [
      'Treat as an exchange control record until direct sync adapters are added.',
      'Use sync to keep activity visible across assets and journals.',
      'Document external withdrawals or conversions with supporting notes.',
    ],
    resourceLinks: [{ label: 'Kraken', url: 'https://www.kraken.com/' }],
  },
  binance_us: {
    provider: 'binance_us',
    label: 'Binance.US',
    railClass: 'exchange',
    executionSupport: 'manual_release',
    bestFor: 'Trading inventory, exchange custody, and liquidation planning.',
    nextSteps: [
      'Set it up as controlled custody.',
      'Use manual release posture for outbound movement until adapters are expanded.',
      'Keep linked treasury and ledger accounts for clean imported posting.',
    ],
    resourceLinks: [{ label: 'Binance.US', url: 'https://www.binance.us/' }],
  },
  robinhood_crypto: {
    provider: 'robinhood_crypto',
    label: 'Robinhood Crypto',
    railClass: 'exchange',
    executionSupport: 'manual_release',
    bestFor: 'Retail trading exposure retained inside the entity asset map.',
    nextSteps: [
      'Connect as controlled exchange custody.',
      'Track holdings, basis, and liquidation posture.',
      'Stage releases until external transfer controls are confirmed.',
    ],
    resourceLinks: [{ label: 'Robinhood Crypto', url: 'https://robinhood.com/us/en/support/articles/crypto-transfers/' }],
  },
  manual: {
    provider: 'manual',
    label: 'Manual Custody',
    railClass: 'manual',
    executionSupport: 'manual_release',
    bestFor: 'Offline custody records, documented holdings, and staged control.',
    nextSteps: [
      'Enter the wallet address or custody label manually.',
      'Link treasury and ledger accounts for retained proof.',
      'Use sync/import posture only when movement is externally documented.',
    ],
    resourceLinks: [],
  },
};

const networkResources: WalletNetworkResource[] = [
  {
    network: 'Ethereum',
    explorerLabel: 'Etherscan',
    explorerUrl: 'https://etherscan.io/',
    actionHints: ['Verify native or ERC-20 transfers.', 'Use for contract and token proof lookups.'],
  },
  {
    network: 'Base',
    explorerLabel: 'BaseScan',
    explorerUrl: 'https://basescan.org/',
    actionHints: ['Good fit for lower-cost EVM activity.', 'Use for wallet payout proof and token activity.'],
  },
  {
    network: 'Polygon',
    explorerLabel: 'PolygonScan',
    explorerUrl: 'https://polygonscan.com/',
    actionHints: ['Use for EVM-compatible asset transfers.', 'Helpful for lower-cost smart-contract activity.'],
  },
  {
    network: 'Bitcoin',
    explorerLabel: 'Mempool',
    explorerUrl: 'https://mempool.space/',
    actionHints: ['Use for BTC receipt and spend confirmation.', 'Treat external sending as controlled/manual release.'],
  },
  {
    network: 'Solana',
    explorerLabel: 'Solscan',
    explorerUrl: 'https://solscan.io/',
    actionHints: ['Use for SPL token and native SOL proof.', 'Keep execution staged until direct Solana signing is expanded.'],
  },
];

export function getWalletProviderResource(provider: WalletConnectionProvider) {
  return providerResources[provider];
}

export function listWalletProviderResources() {
  return Object.values(providerResources);
}

export function getWalletNetworkResource(network?: string) {
  if (!network) {
    return null;
  }

  const normalized = network.toLowerCase();
  return (
    networkResources.find((resource) =>
      normalized.includes(resource.network.toLowerCase())
    ) || null
  );
}

export function buildWalletActionSummary(wallet: WalletRecord) {
  const providerResource = getWalletProviderResource(wallet.connectionProvider || 'manual');
  const networkResource = getWalletNetworkResource(wallet.network);

  return {
    providerLabel: providerResource.label,
    bestFor: providerResource.bestFor,
    nextAction:
      wallet.executionSupport === 'live_broadcast'
        ? 'Ready for signer-confirmed EVM wallet payouts where vendor wallet instructions are present.'
        : wallet.executionSupport === 'manual_release'
          ? 'Use this wallet for custody, proof, sync, and staged/manual release workflows.'
          : 'Use this wallet for visibility and reconciliation until stronger execution controls are added.',
    explorer: networkResource,
  };
}
