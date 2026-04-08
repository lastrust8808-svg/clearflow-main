import type {
  AssetRecord,
  CollateralHoldingRecord,
  CoreDataBundle,
  HolderLedgerEntryRecord,
  InstrumentRecord,
  InstrumentSettlementRecord,
  NegotiableInstrumentRegisterRecord,
  ObligationRecord,
  SettlementRecord,
} from '../types/core';

export interface BondLifecycleView {
  instrument: InstrumentRecord;
  register?: NegotiableInstrumentRegisterRecord;
  obligation?: ObligationRecord;
  settlement?: SettlementRecord;
  instrumentSettlement?: InstrumentSettlementRecord;
  holderLedgerEntries: HolderLedgerEntryRecord[];
  collateralHoldings: CollateralHoldingRecord[];
  pledgedAssets: AssetRecord[];
  pledgedItemCount: number;
  pledgedItemSummary: string;
  currentStage: string;
  applicationLabel: string;
  faceAmountLabel: string;
  evidenceCount: number;
  timelineSummary: string;
}

function formatMoney(amount?: number, currency = 'USD') {
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return `${currency} 0`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatStage(value?: string) {
  return (value || 'draft').replace(/_/g, ' ');
}

export function buildBondLifecycleViews(data: CoreDataBundle): BondLifecycleView[] {
  const settlementById = new Map(data.settlements.map((item) => [item.id, item]));

  return data.instruments
    .filter(
      (instrument) =>
        instrument.instrumentType === 'private_bond' ||
        instrument.sourceClass === 'bond' ||
        instrument.marketSector === 'municipal' ||
        instrument.marketSector === 'corporate' ||
        instrument.marketSector === 'sovereign',
    )
    .map((instrument) => {
      const register = data.negotiableInstrumentRegisters.find(
        (item) => item.instrumentId === instrument.id,
      );
      const obligation = data.obligations.find((item) =>
        item.linkedInstrumentIds?.includes(instrument.id),
      );
      const instrumentSettlement = data.instrumentSettlements.find(
        (item) => item.instrumentId === instrument.id || item.obligationId === obligation?.id,
      );
      const settlement =
        (instrumentSettlement?.linkedSettlementId
          ? settlementById.get(instrumentSettlement.linkedSettlementId)
          : undefined) ||
        (register?.linkedSettlementIds?.[0]
          ? settlementById.get(register.linkedSettlementIds[0])
          : undefined) ||
        (obligation?.linkedSettlementIds?.[0]
          ? settlementById.get(obligation.linkedSettlementIds[0])
          : undefined);
      const holderLedgerEntries = data.holderLedgerEntries
        .filter(
          (item) =>
            item.linkedInstrumentId === instrument.id || item.registerId === register?.id,
        )
        .sort((left, right) => left.entryDate.localeCompare(right.entryDate));
      const collateralHoldings = data.collateralHoldings.filter(
        (item) =>
          item.linkedInstrumentId === instrument.id ||
          item.collateralType === 'bond' ||
          item.holdingLabel.toLowerCase().includes(instrument.title.toLowerCase()),
      );
      const pledgedAssets = data.assets.filter(
        (asset) =>
          instrument.linkedAssetIds?.includes(asset.id) ||
          collateralHoldings.some((holding) => holding.linkedAssetId === asset.id) ||
          collateralHoldings.some((holding) =>
            holding.pledgedItems?.some((pledgedItem) => pledgedItem.assetId === asset.id),
          ),
      );
      const pledgedItemCount =
        collateralHoldings.reduce(
          (sum, holding) => sum + (holding.pledgedItemCount || holding.pledgedItems?.length || 0),
          0,
        ) || pledgedAssets.length;
      const pledgedItemSummary = collateralHoldings
        .flatMap((holding) =>
          holding.pledgedItems?.map((item) => {
            const quantityLabel =
              typeof item.quantity === 'number'
                ? `${item.quantity}${item.unitOfMeasure ? ` ${item.unitOfMeasure}` : ''}`
                : item.unitOfMeasure || '';
            return [quantityLabel, item.metalType, item.label, item.identifier]
              .filter(Boolean)
              .join(' ');
          }) || (holding.pledgedItemSummary ? [holding.pledgedItemSummary] : []),
        )
        .filter(Boolean)
        .join(' | ');
      const applicationType =
        instrument.applicationProfile?.applicationType ||
        (instrumentSettlement?.applicationStage === 'reserve_posted'
          ? 'reserve_support'
          : instrumentSettlement?.applicationStage === 'collateralized'
            ? 'collateral_pledge'
            : instrumentSettlement
              ? 'settlement_support'
              : 'reserve_support');
      const applicationStatus =
        instrument.applicationProfile?.applicationStatus ||
        (instrumentSettlement?.applicationStage === 'applied'
          ? 'active'
          : instrumentSettlement?.applicationStage === 'released'
            ? 'released'
            : register?.status === 'issued'
              ? 'ready'
              : 'not_applied');
      const currentStage =
        instrument.issuanceStatus ||
        instrumentSettlement?.applicationStage ||
        register?.status ||
        instrumentSettlement?.performanceStatus ||
        'draft';
      const evidenceCount =
        (instrument.linkedDocumentIds?.length || 0) +
        (register?.linkedDocumentIds?.length || 0) +
        (instrumentSettlement?.linkedDocumentIds?.length || 0);

      return {
        instrument,
        register,
        obligation,
        settlement,
        instrumentSettlement,
        holderLedgerEntries,
        collateralHoldings,
        pledgedAssets,
        pledgedItemCount,
        pledgedItemSummary:
          pledgedItemSummary ||
          pledgedAssets
            .map((asset) =>
              [
                asset.preciousMetalProfile?.quantity,
                asset.preciousMetalProfile?.unitOfMeasure,
                asset.preciousMetalProfile?.metalType,
                asset.name,
              ]
                .filter(Boolean)
                .join(' '),
            )
            .filter(Boolean)
            .join(' | ') ||
          'No specifically allocated collateral items recorded.',
        currentStage: formatStage(currentStage),
        applicationLabel: `${formatStage(applicationType)} / ${formatStage(applicationStatus)}`,
        faceAmountLabel: formatMoney(
          register?.faceAmount ?? instrumentSettlement?.faceAmount ?? instrument.denominationValue,
          register?.currency || instrumentSettlement?.currency || 'USD',
        ),
        evidenceCount,
        timelineSummary:
          holderLedgerEntries.length > 0
            ? holderLedgerEntries
                .map(
                  (entry) =>
                    `${entry.entryDate}: ${formatStage(entry.applicationEventType || entry.entryType)} ${formatMoney(entry.amount, entry.currency)}`,
                )
                .join(' | ')
            : `Issued ${instrument.issueDate || 'date pending'} and waiting for application events.`,
      };
    });
}
