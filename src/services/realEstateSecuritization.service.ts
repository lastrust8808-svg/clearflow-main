import type {
  AssetRecord,
  CoreDataBundle,
  InstrumentRecord,
  RealEstateOfferingStructure,
} from '../types/core';

type RealEstateSecuritySourceType = 'asset' | 'instrument';

export interface RealEstateSecurityReviewRecord {
  id: string;
  entityId: string;
  sourceType: RealEstateSecuritySourceType;
  sourceId: string;
  label: string;
  offeringStructure: RealEstateOfferingStructure;
  securitiesRiskLevel: 'low' | 'watch' | 'high';
  flags: string[];
  privatePlacementSupportNeeded: boolean;
  accreditedInvestorSupportNeeded: boolean;
  occupancyRestrictionDaysPerYear?: number;
  summary: string;
}

export interface RealEstateSecuritizationSummary {
  reviews: RealEstateSecurityReviewRecord[];
  highRiskCount: number;
  watchCount: number;
  privatePlacementCount: number;
  pooledIncomeCount: number;
}

const realEstateKeywords = [
  'real estate',
  'property',
  'rental',
  'tenant in common',
  'tic',
  'condo hotel',
  'syndication',
  'limited partnership',
  'joint venture',
];

function normalizeText(...parts: Array<string | undefined>) {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function inferOfferingStructure(text: string): RealEstateOfferingStructure {
  if (text.includes('condo hotel')) {
    return 'condo_hotel';
  }
  if (text.includes('tenant in common') || text.includes(' tic ')) {
    return 'tenant_in_common';
  }
  if (text.includes('limited partnership')) {
    return 'limited_partnership';
  }
  if (text.includes('joint venture')) {
    return 'joint_venture';
  }
  if (text.includes('syndication') || text.includes('syndicated')) {
    return 'syndication';
  }
  return 'direct_title';
}

function determineRiskLevel(flags: string[], explicitRisk?: 'low' | 'watch' | 'high') {
  if (explicitRisk) {
    return explicitRisk;
  }
  if (
    flags.includes('Rental pool / pooled income') ||
    flags.includes('Guaranteed return language') ||
    flags.includes('Manager-driven profit reliance')
  ) {
    return 'high';
  }
  if (
    flags.includes('Material occupancy restrictions') ||
    flags.includes('Private placement / accredited investor support needed')
  ) {
    return 'watch';
  }
  return 'low';
}

function buildFlags(
  text: string,
  profile?: AssetRecord['realEstateSecurityProfile'] | InstrumentRecord['realEstateSecurityProfile'],
) {
  const flags: string[] = [];
  const rentalPool =
    profile?.rentalPoolEnabled ?? (text.includes('rental pool') || text.includes('pooled rent'));
  const exclusiveManager =
    profile?.exclusiveManagerEnabled ??
    (text.includes('exclusive manager') ||
      text.includes('exclusive rental') ||
      text.includes('rental manager'));
  const guaranteedReturn =
    profile?.guaranteedReturnOffered ??
    (text.includes('guaranteed return') || text.includes('guaranteed income'));
  const passiveProfit =
    profile?.passiveProfitMarketing ??
    (text.includes('expectation of profit') ||
      text.includes('profit from the efforts of others') ||
      text.includes('passive income'));
  const occupancyRestriction =
    (profile?.occupancyRestrictionDaysPerYear || 0) > 0 ||
    text.includes('occupancy restriction') ||
    text.includes('owner occupancy') ||
    text.includes('days per year');
  const privatePlacement =
    profile?.privatePlacementTargeted ??
    (text.includes('private placement') || text.includes('reg d') || text.includes('506'));
  const accreditedOnly =
    profile?.accreditedInvestorOnly ?? text.includes('accredited investor');

  if (rentalPool) {
    flags.push('Rental pool / pooled income');
  }
  if (exclusiveManager) {
    flags.push('Exclusive manager / rental operator');
  }
  if (guaranteedReturn) {
    flags.push('Guaranteed return language');
  }
  if (passiveProfit || exclusiveManager) {
    flags.push('Manager-driven profit reliance');
  }
  if (occupancyRestriction) {
    flags.push('Material occupancy restrictions');
  }
  if (privatePlacement || accreditedOnly) {
    flags.push('Private placement / accredited investor support needed');
  }

  return {
    flags,
    privatePlacementSupportNeeded: privatePlacement || accreditedOnly,
    accreditedInvestorSupportNeeded: accreditedOnly,
  };
}

function looksLikeRealEstateSecurity(
  assetOrInstrument:
    | Pick<AssetRecord, 'category' | 'name' | 'notes' | 'realEstateSecurityProfile'>
    | Pick<InstrumentRecord, 'title' | 'notes' | 'realEstateSecurityProfile' | 'sourceClass'>,
) {
  const title = 'name' in assetOrInstrument ? assetOrInstrument.name : assetOrInstrument.title;
  const text = normalizeText(title, assetOrInstrument.notes, assetOrInstrument.realEstateSecurityProfile?.securitiesRiskNotes);
  const hasKeyword = realEstateKeywords.some((keyword) => text.includes(keyword));
  const profile = assetOrInstrument.realEstateSecurityProfile;

  return (
    profile?.offeringStructure ||
    profile?.rentalPoolEnabled ||
    profile?.exclusiveManagerEnabled ||
    profile?.guaranteedReturnOffered ||
    profile?.privatePlacementTargeted ||
    ('category' in assetOrInstrument && assetOrInstrument.category === 'real_estate' && hasKeyword) ||
    ('sourceClass' in assetOrInstrument &&
      (assetOrInstrument.sourceClass === 'collateral' || assetOrInstrument.sourceClass === 'other') &&
      hasKeyword) ||
    hasKeyword
  );
}

function buildAssetReview(asset: AssetRecord): RealEstateSecurityReviewRecord | null {
  if (!looksLikeRealEstateSecurity(asset)) {
    return null;
  }

  const text = normalizeText(asset.name, asset.notes, asset.realEstateSecurityProfile?.securitiesRiskNotes);
  const profile = asset.realEstateSecurityProfile;
  const offeringStructure = profile?.offeringStructure || inferOfferingStructure(` ${text} `);
  const { flags, privatePlacementSupportNeeded, accreditedInvestorSupportNeeded } = buildFlags(text, profile);
  const securitiesRiskLevel = determineRiskLevel(flags, profile?.securitiesRiskLevel);

  return {
    id: `re-sec-${asset.id}`,
    entityId: asset.entityId,
    sourceType: 'asset',
    sourceId: asset.id,
    label: asset.name,
    offeringStructure,
    securitiesRiskLevel,
    flags,
    privatePlacementSupportNeeded,
    accreditedInvestorSupportNeeded,
    occupancyRestrictionDaysPerYear: profile?.occupancyRestrictionDaysPerYear,
    summary:
      profile?.securitiesRiskNotes ||
      (flags.length
        ? `Review for ${flags.join(', ').toLowerCase()}.`
        : 'Review for manager control, profit expectations, and pooling posture.'),
  };
}

function buildInstrumentReview(instrument: InstrumentRecord): RealEstateSecurityReviewRecord | null {
  if (!looksLikeRealEstateSecurity(instrument)) {
    return null;
  }

  const text = normalizeText(
    instrument.title,
    instrument.notes,
    instrument.counterpartyLabel,
    instrument.realEstateSecurityProfile?.securitiesRiskNotes,
  );
  const profile = instrument.realEstateSecurityProfile;
  const offeringStructure = profile?.offeringStructure || inferOfferingStructure(` ${text} `);
  const { flags, privatePlacementSupportNeeded, accreditedInvestorSupportNeeded } = buildFlags(text, profile);
  const securitiesRiskLevel = determineRiskLevel(flags, profile?.securitiesRiskLevel);

  return {
    id: `re-sec-${instrument.id}`,
    entityId: instrument.entityId,
    sourceType: 'instrument',
    sourceId: instrument.id,
    label: instrument.title,
    offeringStructure,
    securitiesRiskLevel,
    flags,
    privatePlacementSupportNeeded,
    accreditedInvestorSupportNeeded,
    occupancyRestrictionDaysPerYear: profile?.occupancyRestrictionDaysPerYear,
    summary:
      profile?.securitiesRiskNotes ||
      (flags.length
        ? `Review for ${flags.join(', ').toLowerCase()}.`
        : 'Review for investment-contract posture and disclosure support.'),
  };
}

export function buildRealEstateSecuritizationSummary(
  data: Pick<CoreDataBundle, 'assets' | 'instruments'>,
): RealEstateSecuritizationSummary {
  const reviews = [
    ...data.assets.map(buildAssetReview),
    ...data.instruments.map(buildInstrumentReview),
  ].filter(Boolean) as RealEstateSecurityReviewRecord[];

  return {
    reviews,
    highRiskCount: reviews.filter((item) => item.securitiesRiskLevel === 'high').length,
    watchCount: reviews.filter((item) => item.securitiesRiskLevel === 'watch').length,
    privatePlacementCount: reviews.filter((item) => item.privatePlacementSupportNeeded).length,
    pooledIncomeCount: reviews.filter((item) =>
      item.flags.includes('Rental pool / pooled income'),
    ).length,
  };
}
