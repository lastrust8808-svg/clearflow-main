import type { AssetRecord, CoreDataBundle, InstrumentRecord, SettlementRecord } from '../types/core';

export interface RealPropertyAcquisitionRailView {
  assetId: string;
  propertyLabel: string;
  titleCompany: string;
  purchasePrice: number;
  acquisitionStatus: NonNullable<AssetRecord['realPropertyAcquisitionProfile']>['acquisitionStatus'];
  preferredRail: NonNullable<AssetRecord['realPropertyAcquisitionProfile']>['preferredSettlementRail'];
  wireReady: boolean;
  noteReady: boolean;
  closingReady: boolean;
  linkedNote?: InstrumentRecord;
  linkedSettlement?: SettlementRecord;
  blockers: string[];
  nextAction: string;
}

function isRealPropertyAsset(asset: AssetRecord) {
  return asset.realPropertyAcquisitionProfile || asset.category === 'real_estate';
}

function hasAcceptedTitleNote(note?: InstrumentRecord) {
  if (!note) {
    return false;
  }

  return note.realPropertyNoteProfile?.titleAcceptanceStatus === 'accepted';
}

function settlementPostedToTitle(settlement?: SettlementRecord) {
  if (!settlement) {
    return false;
  }

  return (
    settlement.path === 'wire' &&
    settlement.executionRail === 'Fedwire' &&
    settlement.externalStatus === 'settled' &&
    settlement.verificationStatus === 'verified' &&
    !!settlement.realPropertyClosingProfile?.titleReceiptDocumentId
  );
}

export function buildRealPropertyAcquisitionRailView(
  asset: AssetRecord,
  data: CoreDataBundle,
): RealPropertyAcquisitionRailView | null {
  if (!isRealPropertyAsset(asset)) {
    return null;
  }

  const profile = asset.realPropertyAcquisitionProfile;
  const linkedNote = data.instruments.find((item) => item.id === profile?.linkedAcquisitionNoteId);
  const linkedSettlement = data.settlements.find((item) => item.id === profile?.linkedSettlementId);
  const titleWireVerified = profile?.titleWireVerificationStatus === 'verified';
  const wireInstructionReady = !!profile?.titleWireInstructionDocumentId && titleWireVerified;
  const preferredRail = profile?.preferredSettlementRail || 'Fedwire';
  const noteReady = hasAcceptedTitleNote(linkedNote);
  const wireReady = preferredRail === 'Fedwire' && wireInstructionReady;
  const closingPosted = settlementPostedToTitle(linkedSettlement);

  const blockers = [
    profile?.purchaseAgreementDocumentId ? '' : 'Attach purchase agreement.',
    profile?.closingDisclosureDocumentId ? '' : 'Attach closing disclosure or settlement statement.',
    wireInstructionReady ? '' : 'Verify title-company wire instructions by call-back before release.',
    preferredRail === 'Fedwire' ? '' : 'Title-company closing normally requires Fedwire; confirm any alternative rail in writing.',
    profile?.sourceBankAccountId ? '' : 'Select the source bank or treasury account for closing funds.',
    profile?.collateralNoteTreatment === 'cash_wire_only' || noteReady
      ? ''
      : 'If using an entity-issued note, capture title-company or seller acceptance before treating it as funding support.',
  ].filter(Boolean);

  return {
    assetId: asset.id,
    propertyLabel: profile?.propertyAddress || asset.name,
    titleCompany: profile?.titleCompanyName || 'Title company not set',
    purchasePrice: profile?.purchasePrice || asset.bookValue || asset.marketValue || 0,
    acquisitionStatus: profile?.acquisitionStatus || 'pipeline',
    preferredRail,
    wireReady,
    noteReady,
    closingReady: blockers.length === 0,
    linkedNote,
    linkedSettlement,
    blockers,
    nextAction: closingPosted
      ? 'Closing settlement is posted with title receipt. Move asset to acquired and retain deed/title proof.'
      : blockers[0] || 'Release Fedwire through the connected bank or treasury provider, then attach title receipt.',
  };
}

export function buildRealPropertyAcquisitionRailViews(data: CoreDataBundle) {
  return data.assets
    .map((asset) => buildRealPropertyAcquisitionRailView(asset, data))
    .filter((item): item is RealPropertyAcquisitionRailView => !!item);
}

