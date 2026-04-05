import type {
  BorrowingFacilityRecord,
  CollateralHoldingRecord,
  FuturesStrategyRecord,
  LiquidationPlanRecord,
} from '../types/core';

export interface CapitalStrategySummary {
  activeBorrowingExposure: number;
  availableBorrowingCapacity: number;
  pledgedCollateralValue: number;
  collateralCoverageValue: number;
  activeFuturesNotional: number;
  activeFuturesMargin: number;
  liquidationTargetAmount: number;
  projectedLiquidationProceeds: number;
  blockedLiquidationCount: number;
}

export function buildCapitalStrategySummary(args: {
  borrowingFacilities: BorrowingFacilityRecord[];
  collateralHoldings: CollateralHoldingRecord[];
  futuresStrategies: FuturesStrategyRecord[];
  liquidationPlans: LiquidationPlanRecord[];
}): CapitalStrategySummary {
  const activeBorrowing = args.borrowingFacilities.filter((item) => item.status === 'active' || item.status === 'watch');
  const activeCollateral = args.collateralHoldings.filter(
    (item) => item.status === 'pledged' || item.status === 'margin_locked' || item.status === 'available',
  );
  const activeFutures = args.futuresStrategies.filter((item) => item.status === 'active' || item.status === 'watch');
  const liveLiquidations = args.liquidationPlans.filter((item) => item.status !== 'completed');

  return {
    activeBorrowingExposure: activeBorrowing.reduce((sum, item) => sum + item.drawnAmount, 0),
    availableBorrowingCapacity: activeBorrowing.reduce(
      (sum, item) => sum + (item.availableAmount ?? Math.max(0, item.commitmentAmount - item.drawnAmount)),
      0,
    ),
    pledgedCollateralValue: args.collateralHoldings
      .filter((item) => item.status === 'pledged' || item.status === 'margin_locked')
      .reduce((sum, item) => sum + item.marketValue, 0),
    collateralCoverageValue: activeCollateral.reduce(
      (sum, item) => sum + (item.lendableValue ?? item.marketValue * ((item.advanceRate ?? 100) / 100)),
      0,
    ),
    activeFuturesNotional: activeFutures.reduce((sum, item) => sum + item.notionalExposure, 0),
    activeFuturesMargin: activeFutures.reduce((sum, item) => sum + item.marginPosted, 0),
    liquidationTargetAmount: liveLiquidations.reduce((sum, item) => sum + item.targetAmount, 0),
    projectedLiquidationProceeds: liveLiquidations.reduce(
      (sum, item) => sum + (item.projectedNetProceeds ?? item.targetAmount),
      0,
    ),
    blockedLiquidationCount: liveLiquidations.filter((item) => item.status === 'blocked').length,
  };
}
