import type { FinancialConnectionProvider, FinancialConnectionRail } from '../types/core';

export interface FinancialConnectionProviderDefinition {
  providerKey: FinancialConnectionProvider;
  label: string;
  category: 'bank' | 'credit' | 'processor' | 'wallet' | 'card_program' | 'treasury';
  connectionRail: FinancialConnectionRail;
  availabilityStatus: 'live' | 'profile_only' | 'bank_dependent';
  supportsLiveSync: boolean;
  supportsTransactionImport: boolean;
  supportsSettlementInitiation: boolean;
  supportsAchOrigination: boolean;
  supportsWireOrigination: boolean;
  supportsInstantRails: boolean;
  accountTypeHint: 'checking' | 'savings' | 'credit_card' | 'custodial' | 'other';
  executionReadiness: 'ready_now' | 'staged' | 'institution_dependent';
  supportedRails: string[];
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
    supportsAchOrigination: true,
    supportsWireOrigination: false,
    supportsInstantRails: false,
    accountTypeHint: 'checking',
    executionReadiness: 'institution_dependent',
    supportedRails: ['ACH verification', 'bank feed sync', 'Transfer / ACH (provider-scoped)'],
    description:
      'Use a live institution login for bank and card issuers, keep linked accounts as permanent ERP and COA records, and treat ACH origination as provider-scoped rather than universally enabled.',
  },
  {
    providerKey: 'dwolla',
    label: 'Dwolla Treasury Rail',
    category: 'treasury',
    connectionRail: 'api',
    availabilityStatus: 'profile_only',
    supportsLiveSync: false,
    supportsTransactionImport: false,
    supportsSettlementInitiation: true,
    supportsAchOrigination: true,
    supportsWireOrigination: true,
    supportsInstantRails: false,
    accountTypeHint: 'checking',
    executionReadiness: 'staged',
    supportedRails: ['ACH credit', 'ACH debit', 'wire'],
    description:
      'Execution-focused ACH and wire provider profile for moving from retained ERP intent into real bank-originated transfers with provider status tracking.',
  },
  {
    providerKey: 'treasury_prime',
    label: 'Treasury Prime',
    category: 'treasury',
    connectionRail: 'api',
    availabilityStatus: 'profile_only',
    supportsLiveSync: false,
    supportsTransactionImport: false,
    supportsSettlementInitiation: true,
    supportsAchOrigination: true,
    supportsWireOrigination: true,
    supportsInstantRails: false,
    accountTypeHint: 'checking',
    executionReadiness: 'staged',
    supportedRails: ['ACH', 'same-day ACH', 'wire', 'bank ledger'],
    description:
      'Banking-as-a-service posture for ACH and wire origination when ClearFlow graduates from control to true bank-connected treasury execution.',
  },
  {
    providerKey: 'modern_treasury',
    label: 'Modern Treasury',
    category: 'treasury',
    connectionRail: 'api',
    availabilityStatus: 'profile_only',
    supportsLiveSync: false,
    supportsTransactionImport: false,
    supportsSettlementInitiation: true,
    supportsAchOrigination: true,
    supportsWireOrigination: true,
    supportsInstantRails: true,
    accountTypeHint: 'checking',
    executionReadiness: 'staged',
    supportedRails: ['ACH', 'wire', 'RTP', 'FedNow (bank dependent)'],
    description:
      'Treasury operations control layer for payments, approval workflows, reconciliation, and execution status across multiple bank rails.',
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
    supportsAchOrigination: false,
    supportsWireOrigination: false,
    supportsInstantRails: false,
    accountTypeHint: 'other',
    executionReadiness: 'staged',
    supportedRails: ['processor payouts', 'card settlement'],
    description:
      'Retain a permanent Stripe settlement account profile now, with deeper OAuth and payout sync reserved for the connector layer.',
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
    supportsAchOrigination: false,
    supportsWireOrigination: false,
    supportsInstantRails: true,
    accountTypeHint: 'other',
    executionReadiness: 'staged',
    supportedRails: ['wallet transfer', 'peer transfer'],
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
    supportsAchOrigination: false,
    supportsWireOrigination: false,
    supportsInstantRails: false,
    accountTypeHint: 'other',
    executionReadiness: 'staged',
    supportedRails: ['wallet payout', 'processor settlement'],
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
    supportsAchOrigination: false,
    supportsWireOrigination: false,
    supportsInstantRails: false,
    accountTypeHint: 'other',
    executionReadiness: 'staged',
    supportedRails: ['processor payout', 'merchant settlement'],
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
    supportsAchOrigination: false,
    supportsWireOrigination: false,
    supportsInstantRails: false,
    accountTypeHint: 'credit_card',
    executionReadiness: 'staged',
    supportedRails: ['statement intake', 'manual remittance'],
    description:
      'Use for third-party credit cards, merchant cards, and revolving credit accounts when you want a permanent connected profile even before live issuer aggregation is turned on.',
  },
  {
    providerKey: 'manual',
    label: 'Manual Treasury Profile',
    category: 'treasury',
    connectionRail: 'manual_profile',
    availabilityStatus: 'bank_dependent',
    supportsLiveSync: false,
    supportsTransactionImport: true,
    supportsSettlementInitiation: false,
    supportsAchOrigination: false,
    supportsWireOrigination: false,
    supportsInstantRails: false,
    accountTypeHint: 'checking',
    executionReadiness: 'institution_dependent',
    supportedRails: ['manual ACH file', 'manual wire', 'bank bill pay', 'statement import'],
    description:
      'Use when execution happens through the bank or treasury desk directly and ClearFlow needs to retain the routing, proof, and reconciliation posture.',
  },
];

export function getFinancialConnectionProviders() {
  return providerCatalog;
}

export function getFinancialConnectionProvider(providerKey: FinancialConnectionProvider) {
  return providerCatalog.find((provider) => provider.providerKey === providerKey);
}
