import type { DigitalAssetRecord, VendorRecord, WalletRecord } from '../types/core';

interface InjectedEthereumProvider {
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: InjectedEthereumProvider;
  }
}

function isEvmNetwork(network?: string) {
  const normalized = String(network || '').toLowerCase();
  return ['ethereum', 'base', 'polygon'].some((label) => normalized.includes(label));
}

function normalizeNetworkLabel(network?: string) {
  const normalized = String(network || '').trim().toLowerCase();

  if (normalized.includes('ethereum') || normalized === 'eth') {
    return 'ethereum';
  }

  if (normalized.includes('base')) {
    return 'base';
  }

  if (normalized.includes('polygon') || normalized.includes('matic')) {
    return 'polygon';
  }

  return normalized;
}

function networksAppearCompatible(left?: string, right?: string) {
  if (!left || !right) {
    return true;
  }

  return normalizeNetworkLabel(left) === normalizeNetworkLabel(right);
}

function isHexAddress(value?: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
}

function normalizeTokenDecimals(asset?: DigitalAssetRecord) {
  if (typeof asset?.tokenDecimals === 'number' && Number.isFinite(asset.tokenDecimals)) {
    return Math.max(0, Math.min(30, Math.trunc(asset.tokenDecimals)));
  }

  const symbol = String(asset?.symbol || '').toUpperCase();
  if (symbol === 'USDC' || symbol === 'USDT') {
    return 6;
  }

  return 18;
}

function resolveAssetUnits(amount: number, asset?: DigitalAssetRecord) {
  const unitPrice =
    asset && asset.quantity > 0
      ? asset.estimatedValue / Math.max(asset.quantity, 0.00000001)
      : 2500;

  return amount / Math.max(unitPrice, 0.00000001);
}

function encodeUint256Hex(value: bigint) {
  return value.toString(16).padStart(64, '0');
}

function encodeAddressWord(value: string) {
  return value.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

function decimalToUnits(value: number, decimals: number) {
  const safeValue = Number.isFinite(value) && value > 0 ? value : 0;
  const precision = Math.min(Math.max(decimals, 0), 8);
  const [wholePart, fractionalPart = ''] = safeValue.toFixed(precision).split('.');
  const normalizedFraction = (fractionalPart + '0'.repeat(decimals)).slice(0, decimals);

  return BigInt(wholePart || '0') * 10n ** BigInt(decimals) + BigInt(normalizedFraction || '0');
}

function buildErc20TransferData(destinationAddress: string, units: bigint) {
  return `0xa9059cbb${encodeAddressWord(destinationAddress)}${encodeUint256Hex(units)}`;
}

export function canUseInjectedWalletExecution(wallet?: WalletRecord, vendor?: VendorRecord) {
  return Boolean(
    wallet &&
      vendor?.paymentInstructions?.digitalWalletAddress &&
      isEvmNetwork(wallet.network) &&
      typeof window !== 'undefined' &&
      window.ethereum?.request
  );
}

export async function executeInjectedWalletPayment(input: {
  wallet: WalletRecord;
  vendor: VendorRecord;
  asset?: DigitalAssetRecord;
  amountFiat: number;
}) {
  if (!window.ethereum?.request) {
    throw new Error('No injected wallet provider is available.');
  }

  const destinationAddress = input.vendor.paymentInstructions?.digitalWalletAddress;
  if (!destinationAddress) {
    throw new Error('Vendor does not have a digital wallet address on file.');
  }

  if (!isEvmNetwork(input.wallet.network)) {
    throw new Error('Injected wallet execution is currently supported for EVM networks only.');
  }

  const vendorNetwork = input.vendor.paymentInstructions?.digitalWalletNetwork;
  const assetNetwork = input.asset?.network;

  if (!networksAppearCompatible(input.wallet.network, vendorNetwork || assetNetwork)) {
    throw new Error(
      `The connected wallet network (${input.wallet.network}) does not match the vendor payout network (${vendorNetwork || assetNetwork}).`
    );
  }

  const assetUnits = resolveAssetUnits(input.amountFiat, input.asset);
  const useTokenTransfer =
    Boolean(input.asset?.contractAddress) &&
    isHexAddress(input.asset?.contractAddress) &&
    input.asset?.assetSubtype !== 'native_coin';

  if (useTokenTransfer) {
    const decimals = normalizeTokenDecimals(input.asset);
    const tokenUnits = decimalToUnits(assetUnits, decimals);
    const txHash = (await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: input.wallet.address,
          to: input.asset?.contractAddress,
          value: '0x0',
          data: buildErc20TransferData(destinationAddress, tokenUnits),
        },
      ],
    })) as string;

    return {
      txHash,
      destinationAddress,
      executionMode: 'injected_wallet' as const,
      transferKind: 'erc20_transfer' as const,
      assetAmount: assetUnits,
      rawUnits: tokenUnits.toString(),
      contractAddress: input.asset?.contractAddress,
      assetSymbol: input.asset?.symbol,
    };
  }

  const nativeAmount = assetUnits;
  const valueHex = `0x${decimalToUnits(nativeAmount, 18).toString(16)}`;
  const txHash = (await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: input.wallet.address,
        to: destinationAddress,
        value: valueHex,
      },
    ],
  })) as string;

  return {
    txHash,
    destinationAddress,
    executionMode: 'injected_wallet' as const,
    transferKind: 'native_transfer' as const,
    assetAmount: nativeAmount,
    assetSymbol: input.asset?.symbol || input.wallet.nativeAssetSymbol,
  };
}

export async function pollInjectedWalletTransaction(txHash: string) {
  if (!window.ethereum?.request) {
    return { status: 'provider_unavailable' as const };
  }

  const receipt = (await window.ethereum.request({
    method: 'eth_getTransactionReceipt',
    params: [txHash],
  })) as { status?: string } | null;

  if (!receipt) {
    return { status: 'pending' as const };
  }

  return {
    status: receipt.status === '0x1' ? ('confirmed' as const) : ('failed' as const),
  };
}
