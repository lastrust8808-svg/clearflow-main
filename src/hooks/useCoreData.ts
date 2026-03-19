import {
  mockAccounts,
  mockAssets,
  mockCompliance,
  mockDashboardSummary,
  mockDocuments,
  mockEntities,
  mockOnChainTransactions,
  mockTransactions,
  mockWallets,
} from '../data/mock-core-data';

export function useCoreData() {
  return {
    entities: mockEntities,
    accounts: mockAccounts,
    wallets: mockWallets,
    assets: mockAssets,
    transactions: mockTransactions,
    onChainTransactions: mockOnChainTransactions,
    complianceItems: mockCompliance,
    documents: mockDocuments,
    dashboardSummary: mockDashboardSummary,
  };
}
