import { useMemo } from 'react';
import { coreMockData } from '../data/mockData';

export function useCoreData() {
  return useMemo(() => {
    const dashboardSummary = {
      entityCount: coreMockData.entities.length,
      accountCount: coreMockData.ledgerAccounts.length,
      assetCount: coreMockData.assets.length,
      digitalAssetCount: coreMockData.digitalAssets.length,
      walletCount: coreMockData.wallets.length,
      transactionCount: coreMockData.transactions.length,
      onChainTransactionCount: coreMockData.onChainTransactions.length,
      documentCount: coreMockData.documents.length,
      complianceCount:
        coreMockData.complianceTags.length + coreMockData.digitalAssetCompliance.length,
      totalAssetBookValue: coreMockData.assets.reduce(
        (sum, item) => sum + item.bookValue,
        0
      ),
      totalDigitalAssetEstimatedValue: coreMockData.digitalAssets.reduce(
        (sum, item) => sum + item.estimatedValue,
        0
      ),
      reviewItems:
        coreMockData.complianceTags.filter((item) => item.status === 'review').length +
        coreMockData.digitalAssetCompliance.filter(
          (item) =>
            item.sourceOfFundsRecordStatus !== 'complete' ||
            item.counterpartyOrProtocolRisk === 'high'
        ).length,
    };

    return {
      dashboardSummary,
      entities: coreMockData.entities,
      accounts: coreMockData.ledgerAccounts,
      ledgerAccounts: coreMockData.ledgerAccounts,
      assets: coreMockData.assets,
      wallets: coreMockData.wallets,
      digitalAssets: coreMockData.digitalAssets,
      smartContractPositions: coreMockData.smartContractPositions,
      instruments: coreMockData.instruments,
      obligations: coreMockData.obligations,
      authorities: coreMockData.authorityRecords,
      authorityRecords: coreMockData.authorityRecords,
      transactions: coreMockData.transactions,
      onChainTransactions: coreMockData.onChainTransactions,
      documents: coreMockData.documents,
      compliance: coreMockData.complianceTags,
      complianceTags: coreMockData.complianceTags,
      digitalAssetCompliance: coreMockData.digitalAssetCompliance,
      aiWorkflows: coreMockData.aiWorkflows,

      // kept as placeholders so older modules do not break
      reportingRules: [],
      transactionTaxProfiles: [],
      generatedReportingPackets: [],
    };
  }, []);
}

export default useCoreData;