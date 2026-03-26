import { getApiBaseUrl } from './runtimeConfig.service';
import type { TransactionProofChainEnvelope } from './transactionProofChain.service';

const STORAGE_API_BASE = getApiBaseUrl();

function normalizeAccountId(accountId: string) {
  return encodeURIComponent(accountId);
}

function buildTransactionProofUrl(accountId: string) {
  return `${STORAGE_API_BASE}/api/storage/accounts/${normalizeAccountId(
    accountId
  )}/transaction-proof-chains`;
}

export async function saveTransactionProofChains(
  accountId: string,
  chains: TransactionProofChainEnvelope[]
) {
  const response = await fetch(buildTransactionProofUrl(accountId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chains }),
  });

  if (!response.ok) {
    throw new Error('Failed to save encrypted transaction proof chains.');
  }

  return response.json();
}

export async function loadTransactionProofChains(accountId: string) {
  const response = await fetch(buildTransactionProofUrl(accountId), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to load encrypted transaction proof chains.');
  }

  const payload = (await response.json()) as {
    success: boolean;
    chains: TransactionProofChainEnvelope[];
    savedAt?: string;
  };

  return payload;
}
