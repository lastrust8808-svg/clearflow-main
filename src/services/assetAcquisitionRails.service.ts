import type { AssetRecord, CoreDataBundle, InstrumentRecord, SettlementRecord } from '../types/core';

export interface AssetAcquisitionRailView {
  assetId: string;
  assetLabel: string;
  acquisitionClass: NonNullable<AssetRecord['acquisitionProfile']>['acquisitionClass'];
  sellerOrSupplier: string;
  purchaseAmount: number;
  preferredRail: NonNullable<AssetRecord['acquisitionProfile']>['preferredRail'];
  preferredProvider?: NonNullable<AssetRecord['acquisitionProfile']>['preferredProvider'];
  instructionReady: boolean;
  collateralReady: boolean;
  settlementReady: boolean;
  linkedNote?: InstrumentRecord;
  linkedSettlement?: SettlementRecord;
  blockers: string[];
  nextAction: string;
}

const titleOrLienClasses = new Set(['fleet_vehicle', 'heavy_equipment', 'aircraft', 'marine', 'land']);
const deliveryClasses = new Set(['heavy_equipment', 'fleet_vehicle', 'construction_materials', 'inventory']);

function resolvePurchaseAmount(asset: AssetRecord) {
  return asset.acquisitionProfile?.unitCount && asset.bookValue
    ? asset.bookValue
    : asset.marketValue || asset.bookValue || asset.realPropertyAcquisitionProfile?.purchasePrice || 0;
}

function settlementConfirmsAcquisition(settlement?: SettlementRecord) {
  return (
    !!settlement &&
    ['settled', 'applied', 'accepted'].includes(settlement.externalStatus || '') &&
    settlement.verificationStatus === 'verified'
  );
}

function noteAccepted(note?: InstrumentRecord) {
  return (
    !!note &&
    (note.realPropertyNoteProfile?.titleAcceptanceStatus === 'accepted' ||
      note.applicationProfile?.applicationStatus === 'active' ||
      note.issuanceStatus === 'applied')
  );
}

export function buildAssetAcquisitionRailView(asset: AssetRecord, data: CoreDataBundle): AssetAcquisitionRailView | null {
  const profile = asset.acquisitionProfile;
  if (!profile) {
    return null;
  }

  const linkedNote = data.instruments.find((item) => item.id === profile.linkedAcquisitionNoteId);
  const linkedSettlement = data.settlements.find((item) => item.id === profile.linkedSettlementId);
  const acquisitionClass = profile.acquisitionClass || 'general_asset';
  const preferredRail = profile.preferredRail || 'Fedwire';
  const requiresTitleOrLien = titleOrLienClasses.has(acquisitionClass);
  const requiresDelivery = deliveryClasses.has(acquisitionClass);
  const instructionReady =
    profile.instructionVerificationStatus === 'counterparty_verified' ||
    profile.instructionVerificationStatus === 'lien_or_title_verified' ||
    profile.instructionVerificationStatus === 'inspection_verified';
  const collateralReady =
    profile.collateralTreatment === 'cash_purchase' ||
    profile.collateralTreatment === 'floorplan_or_inventory_line' ||
    noteAccepted(linkedNote);
  const settlementReady = settlementConfirmsAcquisition(linkedSettlement);

  const blockers = [
    profile.purchaseAgreementDocumentId || profile.billOfSaleDocumentId ? '' : 'Attach purchase agreement, invoice, or bill of sale.',
    instructionReady ? '' : 'Verify seller, supplier, dealer, escrow, or wire instructions before release.',
    requiresTitleOrLien && !profile.titleOrLienDocumentId ? 'Attach title, lien, UCC, MSO, or ownership evidence.' : '',
    requiresDelivery && !profile.deliveryOrPossessionDocumentId ? 'Attach delivery, possession, inspection, or acceptance proof.' : '',
    profile.sourceBankAccountId ? '' : 'Select the funding bank, treasury, or liquidity source.',
    collateralReady ? '' : 'If using note/collateral financing, capture accepted note, lender, or seller-finance proof.',
  ].filter(Boolean);

  return {
    assetId: asset.id,
    assetLabel: asset.name,
    acquisitionClass,
    sellerOrSupplier: profile.sellerOrSupplierName || 'Seller / supplier not set',
    purchaseAmount: resolvePurchaseAmount(asset),
    preferredRail,
    preferredProvider: profile.preferredProvider,
    instructionReady,
    collateralReady,
    settlementReady,
    linkedNote,
    linkedSettlement,
    blockers,
    nextAction: settlementReady
      ? 'Settlement is verified. Move the asset to active, attach proof, and begin depreciation or reserve tracking.'
      : blockers[0] || 'Release payment through the selected bank, escrow, dealer, or supplier rail and attach the received confirmation.',
  };
}

export function buildAssetAcquisitionRailViews(data: CoreDataBundle) {
  return data.assets
    .map((asset) => buildAssetAcquisitionRailView(asset, data))
    .filter((item): item is AssetAcquisitionRailView => !!item);
}

