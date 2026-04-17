import type { AssetRecord, CoreDataBundle } from '../types/core';

type ConversionProfile = NonNullable<AssetRecord['collateralConversionProfile']>;

export interface CollateralConversionRailView {
  assetId: string;
  assetLabel: string;
  entityLabel: string;
  sourceClass: NonNullable<ConversionProfile['sourceCollateralClass']>;
  status: NonNullable<ConversionProfile['conversionStatus']>;
  providerLabel: string;
  providerConnectionStatus: NonNullable<ConversionProfile['providerConnectionStatus']>;
  estimatedNetProceeds: number;
  destinationLabel: string;
  custodyProofReady: boolean;
  saleProofReady: boolean;
  cashReceiptReady: boolean;
  securitiesReferenceReady: boolean;
  cashAvailable: boolean;
  blockers: string[];
  nextAction: string;
}

function valueOrMarket(asset: AssetRecord) {
  return asset.collateralConversionProfile?.estimatedNetProceeds ||
    asset.collateralConversionProfile?.estimatedGrossProceeds ||
    asset.marketValue ||
    asset.bookValue ||
    0;
}

function resolveDestination(profile: ConversionProfile, data: CoreDataBundle) {
  const bank = profile.destinationBankAccountId
    ? data.bankAccounts.find((account) => account.id === profile.destinationBankAccountId)
    : undefined;
  const treasury = profile.destinationTreasuryAccountId
    ? data.treasuryAccounts.find((account) => account.id === profile.destinationTreasuryAccountId)
    : undefined;
  const entity = profile.destinationEntityId
    ? data.entities.find((item) => item.id === profile.destinationEntityId)
    : undefined;

  if (bank) return `${bank.institutionName} ${bank.accountName}`;
  if (treasury) return treasury.name;
  if (entity) return `${entity.displayName || entity.name} operating cash`;
  return 'Destination account not selected';
}

function hasSecuritiesReference(asset: AssetRecord, profile: ConversionProfile) {
  if (profile.sourceCollateralClass !== 'security' && asset.category !== 'security') {
    return true;
  }
  return Boolean(
    profile.secOfferingReference ||
      profile.edgarAccessionNumber ||
      profile.treasuryDirectReference ||
      asset.identifierCode,
  );
}

export function buildCollateralConversionRailView(
  asset: AssetRecord,
  data: CoreDataBundle,
): CollateralConversionRailView | null {
  const profile = asset.collateralConversionProfile;
  if (!profile) return null;

  const sourceClass = profile.sourceCollateralClass || 'other';
  const status = profile.conversionStatus || 'draft';
  const providerConnectionStatus = profile.providerConnectionStatus || 'not_connected';
  const custodyProofReady = Boolean(profile.custodyProofDocumentId || asset.linkedDocumentIds?.length);
  const saleProofReady = Boolean(profile.saleConfirmationDocumentId || profile.settlementStatementDocumentId);
  const cashReceiptReady = Boolean(
    profile.wireConfirmationDocumentId ||
      profile.bankFeedMatchId ||
      profile.linkedSettlementId ||
      status === 'cash_received' ||
      status === 'reconciled',
  );
  const securitiesReferenceReady = hasSecuritiesReference(asset, profile);
  const hasDestination = Boolean(
    profile.destinationBankAccountId || profile.destinationTreasuryAccountId || profile.destinationEntityId,
  );
  const providerReady = providerConnectionStatus !== 'not_connected' || profile.conversionProvider === 'manual_sale';
  const cashAvailable = status === 'cash_received' || status === 'reconciled';

  const blockers = [
    providerReady ? '' : 'Connect or document the custodian, dealer, broker, escrow, exchange, or treasury provider.',
    hasDestination ? '' : 'Select the destination bank, treasury, entity, escrow, or title account for converted cash.',
    custodyProofReady ? '' : 'Attach custody, ownership, account, certificate, warehouse, vault, or position proof.',
    saleProofReady || status === 'draft' || status === 'provider_selected'
      ? ''
      : 'Attach sale confirmation, trade ticket, settlement statement, or dealer receipt.',
    cashReceiptReady || status === 'draft' || status === 'provider_selected' || status === 'submitted'
      ? ''
      : 'Match the wire, bank-feed credit, settlement receipt, or treasury cash confirmation.',
    securitiesReferenceReady ? '' : 'Add SEC/EDGAR, TreasuryDirect, CUSIP/identifier, or private-offering exemption reference.',
  ].filter(Boolean);

  return {
    assetId: asset.id,
    assetLabel: asset.name,
    entityLabel:
      data.entities.find((entity) => entity.id === asset.entityId)?.displayName ||
      data.entities.find((entity) => entity.id === asset.entityId)?.name ||
      'Entity',
    sourceClass,
    status,
    providerLabel: profile.providerName || profile.conversionProvider?.replace(/_/g, ' ') || 'Provider not selected',
    providerConnectionStatus,
    estimatedNetProceeds: valueOrMarket(asset),
    destinationLabel: resolveDestination(profile, data),
    custodyProofReady,
    saleProofReady,
    cashReceiptReady,
    securitiesReferenceReady,
    cashAvailable,
    blockers,
    nextAction: cashAvailable
      ? 'Converted cash is available. Route it into inter-entity clearing, acquisition funding, check issue, or wire release.'
      : blockers[0] || 'Submit conversion and wait for settlement proof before treating proceeds as bank-available cash.',
  };
}

export function buildCollateralConversionRailViews(data: CoreDataBundle) {
  return data.assets
    .map((asset) => buildCollateralConversionRailView(asset, data))
    .filter((item): item is CollateralConversionRailView => Boolean(item));
}
