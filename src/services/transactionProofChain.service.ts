import type { CoreDataBundle } from '../types/core';

export interface TransactionProofChainView {
  chainId: string;
  transactionId: string;
  entityId: string;
  title: string;
  date: string;
  chainIndex: number;
  previousChainId?: string;
  settlementId?: string;
  paymentIds: string[];
  tokenIds: string[];
  movementIdentifierIds: string[];
  verificationStatus: 'sealed' | 'watch';
  watchReasons: string[];
}

export interface TransactionProofChainEnvelope extends TransactionProofChainView {
  previousChainDigest?: string;
  movementDigest: string;
  verificationDigest: string;
  chainDigest: string;
  encryptedAt: string;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

async function sha256Hex(input: string) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return `fallback-${input.length}-${input.slice(0, 12)}`;
  }

  const encoded = new TextEncoder().encode(input);
  const digest = await subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function buildTransactionProofChainViews(data: CoreDataBundle): TransactionProofChainView[] {
  const sortedTransactions = [...data.transactions].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    return dateOrder !== 0 ? dateOrder : left.id.localeCompare(right.id);
  });

  return sortedTransactions.map((transaction, index) => {
    const linkedSettlement = transaction.linkedSettlementId
      ? data.settlements.find((item) => item.id === transaction.linkedSettlementId)
      : undefined;
    const linkedPaymentIds = data.payments
      .filter((item) => item.linkedTransactionIds?.includes(transaction.id))
      .map((item) => item.id);
    const tokenIds = Array.from(
      new Set([
        ...(transaction.linkedTokenIds ?? []),
        ...(linkedSettlement?.linkedTokenIds ?? []),
        ...(linkedPaymentIds.flatMap((paymentId) =>
          data.payments.find((item) => item.id === paymentId)?.releaseTokenId
            ? [data.payments.find((item) => item.id === paymentId)!.releaseTokenId!]
            : []
        ) ?? []),
      ])
    );
    const movementIdentifierIds = data.movementIdentifiers
      .filter(
        (item) =>
          item.linkedSettlementId === linkedSettlement?.id ||
          linkedPaymentIds.includes(item.linkedPaymentId || '')
      )
      .map((item) => item.id);
    const watchReasons = [
      linkedSettlement?.id ? null : 'Missing settlement link',
      linkedPaymentIds.length ? null : 'No linked payments',
      movementIdentifierIds.length ? null : 'No movement identifiers',
      tokenIds.length ? null : 'No verification tokens',
      linkedSettlement?.verificationStatus === 'verified'
        ? null
        : 'Settlement not verified',
    ].filter((item): item is string => Boolean(item));

    return {
      chainId: `tx-chain-${transaction.id}`,
      transactionId: transaction.id,
      entityId: transaction.entityId,
      title: transaction.title,
      date: transaction.date,
      chainIndex: index + 1,
      previousChainId: index > 0 ? `tx-chain-${sortedTransactions[index - 1].id}` : undefined,
      settlementId: linkedSettlement?.id,
      paymentIds: linkedPaymentIds,
      tokenIds,
      movementIdentifierIds,
      verificationStatus: watchReasons.length === 0 ? 'sealed' : 'watch',
      watchReasons,
    };
  });
}

export async function buildTransactionProofChainEnvelopes(
  data: CoreDataBundle
): Promise<TransactionProofChainEnvelope[]> {
  const views = buildTransactionProofChainViews(data);
  const envelopes: TransactionProofChainEnvelope[] = [];
  let previousChainDigest: string | undefined;

  for (const view of views) {
    const transaction = data.transactions.find((item) => item.id === view.transactionId);
    const settlement = view.settlementId
      ? data.settlements.find((item) => item.id === view.settlementId)
      : undefined;
    const payments = data.payments.filter((item) => view.paymentIds.includes(item.id));
    const movementIdentifiers = data.movementIdentifiers.filter((item) =>
      view.movementIdentifierIds.includes(item.id)
    );
    const tokens = data.tokens.filter((item) => view.tokenIds.includes(item.id));

    const movementDigest = await sha256Hex(
      stableStringify({
        transaction,
        settlement,
        payments,
        movementIdentifiers,
      })
    );
    const verificationDigest = await sha256Hex(
      stableStringify({
        tokenIds: view.tokenIds,
        tokens,
        verificationStatus: settlement?.verificationStatus || 'not_started',
        verificationReference: settlement?.verificationReference || null,
      })
    );
    const chainDigest = await sha256Hex(
      stableStringify({
        chainId: view.chainId,
        previousChainDigest: previousChainDigest || null,
        movementDigest,
        verificationDigest,
      })
    );

    envelopes.push({
      ...view,
      previousChainDigest,
      movementDigest,
      verificationDigest,
      chainDigest,
      encryptedAt: new Date().toISOString(),
    });

    previousChainDigest = chainDigest;
  }

  return envelopes;
}
