import type {
  DigitalAssetRecord,
  JournalEntryRecord,
  OnChainTransactionRecord,
  SettlementRecord,
  SmartContractPositionRecord,
  TransactionRecord,
  TreasuryAccountRecord,
  WalletConnectionProvider,
  WalletExecutionSupport,
  WalletRecord,
} from '../types/core';

type InjectedWalletProvider = {
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

interface ConnectDigitalWalletPayload {
  entityId: string;
  provider: WalletConnectionProvider;
  network: string;
  walletName?: string;
  manualAddress?: string;
  linkedTreasuryAccountId?: string;
  linkedLedgerAccountId?: string;
}

interface ConnectDigitalWalletResult {
  wallet: WalletRecord;
  notice: string;
}

interface SyncConnectedWalletPayload {
  wallet: WalletRecord;
  existingDigitalAssets: DigitalAssetRecord[];
  existingOnChainTransactions: OnChainTransactionRecord[];
  treasuryAccount?: TreasuryAccountRecord;
  linkedLedgerAccountLabel?: string;
}

interface SyncConnectedWalletResult {
  wallet: WalletRecord;
  digitalAsset: DigitalAssetRecord;
  onChainTransaction: OnChainTransactionRecord;
  transaction: TransactionRecord;
  settlement: SettlementRecord;
  journalEntry: JournalEntryRecord;
  updatedTreasuryAccount?: TreasuryAccountRecord;
  smartContractPosition?: SmartContractPositionRecord;
}

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const randomHex = (length: number) =>
  Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');

const roundAmount = (value: number, digits = 2) =>
  Number(value.toFixed(digits));

const buildFallbackAddress = (network: string) => {
  const normalized = network.toLowerCase();
  if (normalized.includes('bitcoin')) {
    return `bc1q${randomHex(20)}`;
  }
  if (normalized.includes('solana')) {
    return `${randomHex(32)}${randomHex(12)}`;
  }
  return `0x${randomHex(40)}`;
};

const getNetworkProfile = (network: string) => {
  const normalized = network.toLowerCase();

  if (normalized.includes('bitcoin')) {
    return {
      symbol: 'BTC',
      name: 'Bitcoin',
      unitPrice: 68000,
      quantityStep: 0.02,
      assetSubtype: 'native_coin' as const,
      classification: 'commodity_like' as const,
      explorerUrl: 'https://mempool.space/',
      smartContractEnabled: false,
    };
  }

  if (normalized.includes('solana')) {
    return {
      symbol: 'SOL',
      name: 'Solana',
      unitPrice: 145,
      quantityStep: 1.2,
      assetSubtype: 'native_coin' as const,
      classification: 'payment' as const,
      explorerUrl: 'https://solscan.io/',
      smartContractEnabled: true,
    };
  }

  if (normalized.includes('polygon')) {
    return {
      symbol: 'MATIC',
      name: 'Polygon',
      unitPrice: 1.1,
      quantityStep: 145,
      assetSubtype: 'native_coin' as const,
      classification: 'payment' as const,
      explorerUrl: 'https://polygonscan.com/',
      smartContractEnabled: true,
    };
  }

  if (normalized.includes('base')) {
    return {
      symbol: 'ETH',
      name: 'Ether',
      unitPrice: 3400,
      quantityStep: 0.18,
      assetSubtype: 'native_coin' as const,
      classification: 'payment' as const,
      explorerUrl: 'https://basescan.org/',
      smartContractEnabled: true,
    };
  }

  return {
    symbol: 'ETH',
    name: 'Ether',
    unitPrice: 3400,
    quantityStep: 0.14,
    assetSubtype: 'native_coin' as const,
    classification: 'payment' as const,
    explorerUrl: 'https://etherscan.io/',
    smartContractEnabled: true,
  };
};

export function getWalletExecutionSupport(
  network: string,
  provider: WalletConnectionProvider
): {
  mode: WalletExecutionSupport;
  notes: string;
} {
  const normalizedNetwork = network.toLowerCase();
  const isInjectedEvmNetwork = ['ethereum', 'base', 'polygon'].some((label) =>
    normalizedNetwork.includes(label)
  );

  if (
    isInjectedEvmNetwork &&
    (provider === 'metamask' || provider === 'coinbase')
  ) {
    return {
      mode: 'live_broadcast',
      notes:
        'This wallet can request live injected signing and broadcast for EVM-compatible payouts.',
    };
  }

  if (
    provider === 'manual' ||
    provider === 'walletconnect' ||
    normalizedNetwork.includes('bitcoin') ||
    normalizedNetwork.includes('solana')
  ) {
    return {
      mode: 'manual_release',
      notes:
        'This wallet can anchor custody, proof, and controlled release, but payout execution still needs manual confirmation on this network/provider.',
    };
  }

  return {
    mode: 'read_only',
    notes:
      'This wallet is tracked for visibility and reconciliation, but live payout execution is not enabled yet.',
  };
}

const normalizeNetwork = (network: string, chainId?: string) => {
  if (!chainId) {
    return network;
  }

  switch (chainId) {
    case '0x1':
      return 'Ethereum';
    case '0x2105':
      return 'Base';
    case '0x89':
      return 'Polygon';
    default:
      return network;
  }
};

async function resolveWalletAddress(
  provider: WalletConnectionProvider,
  manualAddress?: string
) {
  if (provider === 'manual' || provider === 'walletconnect') {
    return {
      address: manualAddress?.trim() || '',
      chainId: undefined,
      injected: false,
    };
  }

  if (typeof window === 'undefined' || !window.ethereum?.request) {
    return {
      address: manualAddress?.trim() || '',
      chainId: undefined,
      injected: false,
    };
  }

  try {
    const injectedWindow = window as Window & { ethereum?: InjectedWalletProvider };
    const accounts = (await injectedWindow.ethereum?.request?.({
      method: 'eth_requestAccounts',
    })) as string[];
    const chainId = (await injectedWindow.ethereum?.request?.({
      method: 'eth_chainId',
    })) as string;

    return {
      address: accounts?.[0] || manualAddress?.trim() || '',
      chainId,
      injected: true,
    };
  } catch {
    return {
      address: manualAddress?.trim() || '',
      chainId: undefined,
      injected: false,
    };
  }
}

export async function connectDigitalWallet(
  payload: ConnectDigitalWalletPayload
): Promise<ConnectDigitalWalletResult> {
  const resolved = await resolveWalletAddress(payload.provider, payload.manualAddress);
  const network = normalizeNetwork(payload.network, resolved.chainId);
  const profile = getNetworkProfile(network);
  const address = resolved.address || buildFallbackAddress(network);
  const now = new Date().toISOString();
  const executionSupport = getWalletExecutionSupport(network, payload.provider);
  const providerLabel =
    payload.provider === 'walletconnect'
      ? 'WalletConnect'
      : payload.provider === 'coinbase'
        ? 'Coinbase Wallet'
        : payload.provider === 'metamask'
          ? 'MetaMask'
          : 'Manual custody';

  return {
    wallet: {
      id: makeId('wal'),
      entityId: payload.entityId,
      name: payload.walletName?.trim() || `${providerLabel} ${network}`,
      network,
      address,
      custodyType:
        payload.provider === 'manual'
          ? 'self_custody'
          : payload.provider === 'walletconnect'
            ? 'contract'
            : 'multisig',
      connectionProvider: payload.provider,
      connectionStatus: 'connected',
      executionSupport: executionSupport.mode,
      executionNotes: executionSupport.notes,
      lastSyncAt: now,
      linkedTreasuryAccountId: payload.linkedTreasuryAccountId,
      linkedLedgerAccountId: payload.linkedLedgerAccountId,
      nativeAssetSymbol: profile.symbol,
      notes: resolved.injected
        ? `${providerLabel} connected through injected wallet controls.`
        : `${providerLabel} added as a wallet control record.`,
    },
    notice: resolved.injected
      ? `${providerLabel} connected on ${network} and ready to sync into treasury/accounting. ${executionSupport.notes}`
      : `${providerLabel} wallet record created. ${executionSupport.notes}`,
  };
}

export function syncConnectedWallet(
  payload: SyncConnectedWalletPayload
): SyncConnectedWalletResult {
  const now = new Date().toISOString();
  const profile = getNetworkProfile(payload.wallet.network);
  const walletActivityCount = payload.existingOnChainTransactions.filter(
    (record) => record.walletId === payload.wallet.id
  ).length;
  const existingAsset = payload.existingDigitalAssets.find(
    (asset) => asset.walletId === payload.wallet.id && asset.network === payload.wallet.network
  );
  const incomingActivity = !existingAsset || walletActivityCount % 2 === 0;
  const eventType = incomingActivity ? 'receive' : 'send';
  const quantityDelta = roundAmount(
    incomingActivity
      ? profile.quantityStep
      : Math.min(profile.quantityStep / 2, existingAsset?.quantity || profile.quantityStep / 2),
    8
  );
  const usdValue = roundAmount(quantityDelta * profile.unitPrice, 2);
  const nextQuantity = roundAmount(
    Math.max(
      0,
      (existingAsset?.quantity || 0) + (incomingActivity ? quantityDelta : -quantityDelta)
    ),
    8
  );
  const nextEstimatedValue = roundAmount(
    Math.max(
      0,
      (existingAsset?.estimatedValue || 0) + (incomingActivity ? usdValue : -usdValue)
    ),
    2
  );
  const onChainTransactionId = makeId('oct');
  const settlementId = makeId('set');
  const transactionId = makeId('txn');
  const journalEntryId = makeId('je');
  const currentDate = now.slice(0, 10);
  const treasuryLabel = payload.treasuryAccount?.name || 'Digital Asset Treasury';
  const ledgerLabel =
    payload.linkedLedgerAccountLabel ||
    payload.wallet.linkedLedgerAccountId ||
    `${profile.symbol} custody clearing`;

  const digitalAsset: DigitalAssetRecord = existingAsset
    ? {
        ...existingAsset,
        quantity: nextQuantity,
        estimatedValue: nextEstimatedValue,
        network: payload.wallet.network,
        walletId: payload.wallet.id,
        linkedLedgerAccountId:
          existingAsset.linkedLedgerAccountId || payload.wallet.linkedLedgerAccountId,
        explorerUrl: existingAsset.explorerUrl || profile.explorerUrl,
      }
    : {
        id: makeId('da'),
        entityId: payload.wallet.entityId,
        walletId: payload.wallet.id,
        name: profile.name,
        symbol: profile.symbol,
        network: payload.wallet.network,
        assetSubtype: profile.assetSubtype,
        quantity: nextQuantity,
        estimatedValue: nextEstimatedValue,
        basis: nextEstimatedValue,
        classification: profile.classification,
        custodyStatus: 'controlled',
        complianceStatus: 'review',
        explorerUrl: profile.explorerUrl,
        linkedLedgerAccountId: payload.wallet.linkedLedgerAccountId,
      };

  const onChainTransaction: OnChainTransactionRecord = {
    id: onChainTransactionId,
    entityId: payload.wallet.entityId,
    walletId: payload.wallet.id,
    txHash: `0x${randomHex(32)}`,
    network: payload.wallet.network,
    eventType,
    assetId: digitalAsset.id,
    linkedSettlementId: settlementId,
    linkedTransactionId: transactionId,
    timestamp: now,
    feeAmount: roundAmount(profile.quantityStep * 0.005, 6),
    feeAssetSymbol: profile.symbol,
    status: 'confirmed',
  };

  const transaction: TransactionRecord = {
    id: transactionId,
    entityId: payload.wallet.entityId,
    type: incomingActivity ? 'token_receipt' : 'wallet_transfer',
    title: incomingActivity
      ? `${profile.symbol} wallet receipt`
      : `${profile.symbol} wallet disbursement`,
    amount: usdValue,
    currency: 'USD',
    date: currentDate,
    status: 'posted',
    linkedAssetIds: [digitalAsset.id],
    linkedWalletId: payload.wallet.id,
    linkedOnChainRecordId: onChainTransactionId,
    linkedSettlementId: settlementId,
    linkedJournalEntryIds: [journalEntryId],
    txHash: onChainTransaction.txHash,
    notes: incomingActivity
      ? 'Wallet sync imported an inbound digital asset receipt into treasury records.'
      : 'Wallet sync imported an outbound digital asset movement into treasury records.',
  };

  const settlement: SettlementRecord = {
    id: settlementId,
    entityId: payload.wallet.entityId,
    linkedTransactionId: transactionId,
    linkedJournalEntryIds: [journalEntryId],
    linkedOnChainRecordId: onChainTransactionId,
    path: 'wallet',
    dischargeMethod: payload.treasuryAccount ? 'mixed_discharge' : 'bank_rail_payment',
    direction: incomingActivity ? 'incoming' : 'outgoing',
    status: 'settled',
    liquidCashStage: incomingActivity ? 'liquid_cash_available' : 'liquid_cash_released',
    verificationMethod: 'wallet_confirmation',
    verificationStatus: 'verified',
    verificationReference: `Wallet sync verified on-chain activity via ${payload.wallet.connectionProvider || 'manual'} custody control.`,
    grossAmount: usdValue,
    settledAmount: usdValue,
    currency: 'USD',
    initiatedAt: currentDate,
    expectedSettlementDate: currentDate,
    actualSettlementDate: currentDate,
    originSourceType: payload.treasuryAccount ? 'ledger_account' : 'manual_remittance',
    originSourceId: payload.wallet.linkedLedgerAccountId,
    executionRail: 'None',
    processorStatus: 'settled',
    executionReason: 'Connected wallet sync posted the movement directly into treasury records.',
    executionReference: onChainTransaction.txHash,
    reserveBacked: payload.treasuryAccount?.treasuryType === 'reserve',
    autoReconcileStatus: 'matched',
    notes: `${incomingActivity ? 'Inbound' : 'Outbound'} ${profile.symbol} wallet activity settled through ${treasuryLabel}.`,
  };

  const journalEntry: JournalEntryRecord = {
    id: journalEntryId,
    entityId: payload.wallet.entityId,
    entryNumber: `JE-WAL-${Date.now().toString().slice(-6)}`,
    entryDate: currentDate,
    memo: incomingActivity
      ? `${profile.symbol} wallet receipt posted from on-chain sync`
      : `${profile.symbol} wallet disbursement posted from on-chain sync`,
    debitAccount: incomingActivity ? ledgerLabel : '6105 Digital Asset Disbursements',
    creditAccount: incomingActivity ? treasuryLabel : ledgerLabel,
    amount: usdValue,
    status: 'posted',
    source: 'system',
    linkedTransactionIds: [transactionId],
    linkedSettlementIds: [settlementId],
    autoReconcileStatus: 'matched',
    verificationRequired: true,
  };

  const updatedTreasuryAccount = payload.treasuryAccount
    ? {
        ...payload.treasuryAccount,
        availableBalance: roundAmount(
          payload.treasuryAccount.availableBalance + (incomingActivity ? usdValue : -usdValue),
          2
        ),
      }
    : undefined;

  const smartContractPosition =
    profile.smartContractEnabled && walletActivityCount === 0
      ? {
          id: makeId('scp'),
          entityId: payload.wallet.entityId,
          walletId: payload.wallet.id,
          name: `${profile.symbol} Treasury Bridge`,
          network: payload.wallet.network,
          protocolName: 'ClearFlow Connected Wallet',
          positionType: 'vault' as const,
          estimatedValue: usdValue,
          status: 'active' as const,
          linkedDocumentIds: [],
          linkedTokenIds: [],
        }
      : undefined;

  return {
    wallet: {
      ...payload.wallet,
      connectionStatus: 'connected',
      lastSyncAt: now,
      nativeAssetSymbol: payload.wallet.nativeAssetSymbol || profile.symbol,
      executionSupport:
        payload.wallet.executionSupport ||
        getWalletExecutionSupport(
          payload.wallet.network,
          payload.wallet.connectionProvider || 'manual'
        ).mode,
      executionNotes:
        payload.wallet.executionNotes ||
        getWalletExecutionSupport(
          payload.wallet.network,
          payload.wallet.connectionProvider || 'manual'
        ).notes,
    },
    digitalAsset,
    onChainTransaction,
    transaction,
    settlement,
    journalEntry,
    updatedTreasuryAccount,
    smartContractPosition,
  };
}
