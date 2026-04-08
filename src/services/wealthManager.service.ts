import type { User } from '../types/app.models';
import type { CoreDataBundle } from '../types/core';

export interface WealthManagerInsight {
  title: string;
  detail: string;
  priority: 'info' | 'watch' | 'action';
}

export interface WealthManagerSummary {
  enabled: boolean;
  objectiveLabel: string;
  liquidityLabel: string;
  riskLabel: string;
  horizonLabel: string;
  netWorthEstimate: number;
  liquidAssetValue: number;
  reserveValue: number;
  preciousMetalValue: number;
  openObligations: number;
  trustEntityCount: number;
  insights: WealthManagerInsight[];
}

function formatLabel(value?: string) {
  return (value || 'not set').replace(/_/g, ' ');
}

export function buildWealthManagerSummary(
  data: CoreDataBundle,
  user?: User | null,
): WealthManagerSummary {
  const mandate = user?.wealthMandate;
  const liquidAssetValue = data.assets
    .filter((item) => item.category === 'cash')
    .reduce((sum, item) => sum + (item.marketValue ?? item.bookValue), 0);
  const reserveValue = data.treasuryAccounts.reduce(
    (sum, item) => sum + (item.availableBalance || 0),
    0,
  );
  const preciousMetalValue = data.assets
    .filter((item) => item.category === 'metal' || Boolean(item.preciousMetalProfile))
    .reduce((sum, item) => sum + (item.marketValue ?? item.bookValue), 0);
  const totalAssetValue = data.assets.reduce(
    (sum, item) => sum + (item.marketValue ?? item.bookValue),
    0,
  );
  const totalLiabilities = [
    ...data.obligations.map((item) => item.amount || 0),
    ...data.borrowingFacilities.map((item) => item.drawnAmount || 0),
  ].reduce((sum, value) => sum + value, 0);
  const netWorthEstimate = totalAssetValue + reserveValue - totalLiabilities;
  const openObligations = data.obligations.filter((item) => item.status === 'open').length;
  const trustEntityCount = data.entities.filter((item) => item.type === 'trust').length;

  const insights: WealthManagerInsight[] = [];

  if (liquidAssetValue < totalLiabilities * 0.15) {
    insights.push({
      title: 'Liquidity cushion is thin',
      detail:
        'Liquid cash is low relative to open obligations. Build reserve or sequence liquidation before stressing outward settlement.',
      priority: 'action',
    });
  }
  if (trustEntityCount > 0 && data.documents.filter((item) => item.category === 'governing').length === 0) {
    insights.push({
      title: 'Trust records need support',
      detail:
        'Trust entities exist without visible governing uploads. Keep fiduciary recommendations conservative until agreements and funding records are on file.',
      priority: 'watch',
    });
  }
  if (preciousMetalValue > 0) {
    insights.push({
      title: 'Precious metals can support collateral strategy',
      detail:
        'Gold, silver, and jewelry holdings are available for collateral mapping, bond support, or staged liquidation sequencing.',
      priority: 'info',
    });
  }
  if (data.collateralHoldings.some((item) => item.status === 'available')) {
    insights.push({
      title: 'Idle collateral is available',
      detail:
        'Some collateral holdings remain available and can be reviewed for reserve, borrowing, or bond-application support.',
      priority: 'info',
    });
  }
  if (openObligations > 0) {
    insights.push({
      title: 'Open obligations should drive funding plans',
      detail:
        'Use the AI wealth manager to coordinate liquidity, reserve, collateral, and liquidation around real payable timing.',
      priority: 'watch',
    });
  }

  return {
    enabled: Boolean(mandate?.enabled),
    objectiveLabel: formatLabel(mandate?.objective),
    liquidityLabel: formatLabel(mandate?.liquidityPreference),
    riskLabel: formatLabel(mandate?.riskTolerance),
    horizonLabel: formatLabel(mandate?.timeHorizon),
    netWorthEstimate,
    liquidAssetValue,
    reserveValue,
    preciousMetalValue,
    openObligations,
    trustEntityCount,
    insights,
  };
}
