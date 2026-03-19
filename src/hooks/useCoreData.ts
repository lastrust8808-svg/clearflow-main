import {
  mockAccounts,
  mockAssets,
  mockAuthorities,
  mockCompliance,
  mockDashboardSummary,
  mockDocuments,
  mockEntities,
  mockGeneratedReportingPackets,
  mockInstruments,
  mockOnChainTransactions,
  mockReportingRules,
  mockTransactionTaxProfiles,
  mockTransactions,
  mockWallets,
} from '../data/mock-core-data';

export function useCoreData() {
  return {
    entities: mockEntities,
    accounts: mockAccounts,
    wallets: mockWallets,
    authorities: mockAuthorities,
    assets: mockAssets,
    instruments: mockInstruments,
    transactions: mockTransactions,
    onChainTransactions: mockOnChainTransactions,
    reportingRules: mockReportingRules,
    transactionTaxProfiles: mockTransactionTaxProfiles,
    generatedReportingPackets: mockGeneratedReportingPackets,
    complianceItems: mockCompliance,
    documents: mockDocuments,
    dashboardSummary: mockDashboardSummary,
  };
}
