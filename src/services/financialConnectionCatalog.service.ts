import type { FinancialConnectionProvider, FinancialConnectionRail } from '../types/core';

export interface FinancialConnectionProviderDefinition {
  providerKey: FinancialConnectionProvider;
  label: string;
  category: 'bank' | 'credit' | 'processor' | 'wallet' | 'card_program';
  connectionRail: FinancialConnectionRail;
  availabilityStatus: 'live' | 'profile_only';
  supportsLiveSync: boolean;
  supportsTransactionImport: boolean;
  supportsSettlementInitiation: boolean;
  accountTypeHint: 'checking' | 'savings' | 'credit_card' | 'custodial' | 'other';
  description: string;
}

const providerCatalog: FinancialConnectionProviderDefinition[] = [
  {
    providerKey: 'plaid',
    label: 'Plaid Institution Login',
    category: 'bank',
    connectionRail: 'plaid_link',
    availabilityStatus: 'live',
    supportsLiveSync: true,
    supportsTransactionImport: true,
    supportsSettlementInitiation: true,
    accountTypeHint: 'checking',
    description:
      'Use a live institution login for supported bank and card issuers, then keep the linked accounts as permanent ERP and COA records.',
  },
  {
    providerKey: 'stripe',
    label: 'Stripe',
    category: 'processor',
    connectionRail: 'oauth',
    availabilityStatus: 'profile_only',
    supportsLiveSync: false,
    supportsTransactionImport: false,
    supportsSettlementInitiation: true,
    accountTypeHint: 'other',
    description:
      'Retain a permanent Stripe settlement account profile now, with live OAuth and payout sync reserved for the next connector layer.',
  },
  {
    providerKey: 'cash_app',
    label: 'Cash App',
    category: 'wallet',
    connectionRail: 'oauth',
    availabilityStatus: 'profile_only',
    supportsLiveSync: false,
    supportsTransactionImport: false,
    supportsSettlementInitiation: true,
    accountTypeHint: 'other',
    description:
      'Save a permanent Cash App operating profile and settlement reference inside the workspace even before a deeper provider connector is enabled.',
  },
  {
    providerKey: 'paypal',
    label: 'PayPal',
    category: 'processor',
    connectionRail: 'oauth',
    availabilityStatus: 'profile_only',
    supportsLiveSync: false,
    supportsTransactionImport: false,
    supportsSettlementInitiation: true,
    accountTypeHint: 'other',
    description:
      'Retain a PayPal operating account profile for remittance, payout, and ledger routing while the direct provider connector stays staged.',
  },
  {
    providerKey: 'square',
    label: 'Square',
    category: 'processor',
    connectionRail: 'oauth',
    availabilityStatus: 'profile_only',
    supportsLiveSync: false,
    supportsTransactionImport: false,
    supportsSettlementInitiation: true,
    accountTypeHint: 'other',
    description:
      'Keep a permanent Square-connected settlement profile inside the chart of accounts for processor-based cashflow and receipts.',
  },
  {
    providerKey: 'issuer_portal',
    label: 'Card / Credit Issuer',
    category: 'credit',
    connectionRail: 'manual_profile',
    availabilityStatus: 'profile_only',
    supportsLiveSync: false,
    supportsTransactionImport: false,
    supportsSettlementInitiation: false,
    accountTypeHint: 'credit_card',
    description:
      'Use for third-party credit cards, merchant cards, and revolving credit accounts when you want a permanent connected profile even before live issuer aggregation is turned on.',
  },
];

export function getFinancialConnectionProviders() {
  return providerCatalog;
}

export function getFinancialConnectionProvider(
  providerKey: FinancialConnectionProvider,
) {
  return providerCatalog.find((provider) => provider.providerKey === providerKey);
}
