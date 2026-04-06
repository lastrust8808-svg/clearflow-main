import { resolveVendorProviderPreset } from './vendorProviderPreset.service';

export interface VendorDirectoryProfile {
  id: string;
  sourceLabel: string;
  sourceType: 'directory_profile' | 'preset_profile';
  canonicalName: string;
  aliases?: string[];
  organizationClass?:
    | 'general'
    | 'large_bank'
    | 'large_corporation'
    | 'utility'
    | 'government'
    | 'servicer';
  remitAddress?: string;
  phone?: string;
  taxId?: string;
  locationId?: string;
  publicProfileUrl?: string;
  referenceLinks?: string[];
  acceptedReceiveMethods?: Array<
    'ach' | 'wire' | 'paper_check' | 'lockbox_coupon' | 'digital_wallet' | 'manual_review'
  >;
  defaultReceiveMethod?:
    | 'ach'
    | 'wire'
    | 'paper_check'
    | 'lockbox_coupon'
    | 'digital_wallet'
    | 'manual_review';
  deliveryDescriptor?: string;
}

const DIRECTORY_SOURCE_LABEL = 'ClearFlow Payee Directory';

function buildProfile(profile: Omit<VendorDirectoryProfile, 'sourceLabel' | 'sourceType'>): VendorDirectoryProfile {
  return {
    sourceLabel: DIRECTORY_SOURCE_LABEL,
    sourceType: 'directory_profile',
    ...profile,
  };
}

const VENDOR_DIRECTORY: VendorDirectoryProfile[] = [
  buildProfile({
    id: 'dir-dte-energy',
    canonicalName: 'DTE Energy',
    aliases: ['dte', 'dte energy', 'dte electric', 'dte gas'],
    organizationClass: 'utility',
    remitAddress: 'DTE Energy, P.O. Box 740786, Cincinnati, OH 45274-0786',
    phone: '800-477-4747',
    locationId: 'DTE-OH-LOCKBOX-740786',
    publicProfileUrl: 'https://www.dteenergy.com/us/en/residential/customer-service/billing-and-payments/ways-to-pay.html',
    referenceLinks: [
      'https://www.dteenergy.com/us/en/residential/customer-service/billing-and-payments/ways-to-pay.html',
      'https://www.dteenergy.com/us/en/contact-us.html',
    ],
    acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'lockbox_coupon',
    deliveryDescriptor:
      'Statement and coupon remittance profile with lockbox mailing workflow and statement-level account references.',
  }),
  buildProfile({
    id: 'dir-consumers-energy',
    canonicalName: 'Consumers Energy',
    aliases: ['consumers', 'consumers energy'],
    organizationClass: 'utility',
    locationId: 'CONSUMERS-UTILITY',
    acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'lockbox_coupon',
  }),
  buildProfile({
    id: 'dir-verizon',
    canonicalName: 'Verizon',
    aliases: ['verizon', 'verizon wireless', 'verizon business', 'vz'],
    organizationClass: 'utility',
    locationId: 'VERIZON-LOCKBOX',
    publicProfileUrl: 'https://www.verizon.com/business/support/pay-bill-faqs/',
    acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'ach', 'manual_review'],
    defaultReceiveMethod: 'lockbox_coupon',
  }),
  buildProfile({
    id: 'dir-att',
    canonicalName: 'AT&T',
    aliases: ['att', 'at&t', 'att wireless', 'at&t business'],
    organizationClass: 'utility',
    locationId: 'ATT-LOCKBOX',
    publicProfileUrl: 'https://www.att.com/support/article/my-account/KM1008836/',
    acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'ach', 'manual_review'],
    defaultReceiveMethod: 'lockbox_coupon',
  }),
  buildProfile({
    id: 'dir-comcast',
    canonicalName: 'Comcast',
    aliases: ['comcast', 'xfinity', 'comcast cable'],
    organizationClass: 'utility',
    locationId: 'COMCAST-BILLPAY',
    acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'lockbox_coupon',
  }),
  buildProfile({
    id: 'dir-spectrum',
    canonicalName: 'Spectrum',
    aliases: ['spectrum', 'charter', 'charter communications'],
    organizationClass: 'utility',
    locationId: 'SPECTRUM-BILLPAY',
    acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'lockbox_coupon',
  }),
  buildProfile({
    id: 'dir-tmobile',
    canonicalName: 'T-Mobile',
    aliases: ['t-mobile', 'tmobile', 'metro pcs', 'metro by t mobile'],
    organizationClass: 'utility',
    locationId: 'TMOBILE-BILLPAY',
    acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'ach', 'manual_review'],
    defaultReceiveMethod: 'lockbox_coupon',
  }),
  buildProfile({
    id: 'dir-american-electric-power',
    canonicalName: 'American Electric Power',
    aliases: ['aep', 'american electric power'],
    organizationClass: 'utility',
    locationId: 'AEP-UTILITY',
    acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'lockbox_coupon',
  }),
  buildProfile({
    id: 'dir-duke-energy',
    canonicalName: 'Duke Energy',
    aliases: ['duke', 'duke energy'],
    organizationClass: 'utility',
    locationId: 'DUKE-UTILITY',
    acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'lockbox_coupon',
  }),
  buildProfile({
    id: 'dir-jpmorgan-chase',
    canonicalName: 'JPMorgan Chase Bank, N.A.',
    aliases: ['chase', 'jpmorgan chase', 'chase bank'],
    organizationClass: 'large_bank',
    locationId: 'CHASE-REMIT',
    publicProfileUrl: 'https://www.chase.com/',
    acceptedReceiveMethods: ['ach', 'wire', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  }),
  buildProfile({
    id: 'dir-bank-of-america',
    canonicalName: 'Bank of America, N.A.',
    aliases: ['bank of america', 'bofa', 'boa'],
    organizationClass: 'large_bank',
    locationId: 'BOFA-REMIT',
    publicProfileUrl: 'https://www.bankofamerica.com/',
    acceptedReceiveMethods: ['ach', 'wire', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  }),
  buildProfile({
    id: 'dir-wells-fargo',
    canonicalName: 'Wells Fargo Bank, N.A.',
    aliases: ['wells fargo', 'wells', 'wf'],
    organizationClass: 'large_bank',
    locationId: 'WELLSFARGO-REMIT',
    acceptedReceiveMethods: ['ach', 'wire', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  }),
  buildProfile({
    id: 'dir-citi',
    canonicalName: 'Citibank, N.A.',
    aliases: ['citibank', 'citi', 'citi bank'],
    organizationClass: 'large_bank',
    locationId: 'CITI-REMIT',
    acceptedReceiveMethods: ['ach', 'wire', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  }),
  buildProfile({
    id: 'dir-capital-one',
    canonicalName: 'Capital One',
    aliases: ['capital one', 'cap one'],
    organizationClass: 'large_bank',
    locationId: 'CAPITALONE-REMIT',
    acceptedReceiveMethods: ['ach', 'wire', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  }),
  buildProfile({
    id: 'dir-american-express',
    canonicalName: 'American Express',
    aliases: ['amex', 'american express'],
    organizationClass: 'large_corporation',
    locationId: 'AMEX-CARD',
    acceptedReceiveMethods: ['ach', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  }),
  buildProfile({
    id: 'dir-discover',
    canonicalName: 'Discover',
    aliases: ['discover', 'discover card'],
    organizationClass: 'large_corporation',
    locationId: 'DISCOVER-CARD',
    acceptedReceiveMethods: ['ach', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  }),
  buildProfile({
    id: 'dir-mortgage-rocket',
    canonicalName: 'Rocket Mortgage',
    aliases: ['rocket mortgage', 'quicken loans', 'rocket'],
    organizationClass: 'servicer',
    locationId: 'ROCKET-MTG',
    acceptedReceiveMethods: ['ach', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  }),
  buildProfile({
    id: 'dir-mortgage-pennymac',
    canonicalName: 'Pennymac',
    aliases: ['pennymac', 'penny mac'],
    organizationClass: 'servicer',
    locationId: 'PENNYMAC-SERVICER',
    acceptedReceiveMethods: ['ach', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  }),
  buildProfile({
    id: 'dir-mortgage-mrcooper',
    canonicalName: 'Mr. Cooper',
    aliases: ['mr cooper', 'nationstar', 'mr. cooper'],
    organizationClass: 'servicer',
    locationId: 'MRCOOPER-SERVICER',
    acceptedReceiveMethods: ['ach', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  }),
  buildProfile({
    id: 'dir-irs',
    canonicalName: 'Internal Revenue Service',
    aliases: ['irs', 'internal revenue service'],
    organizationClass: 'government',
    locationId: 'IRS-FEDERAL',
    acceptedReceiveMethods: ['ach', 'wire', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  }),
  buildProfile({
    id: 'dir-us-treasury',
    canonicalName: 'United States Treasury',
    aliases: ['us treasury', 'u.s. treasury', 'treasury'],
    organizationClass: 'government',
    locationId: 'USTREASURY',
    acceptedReceiveMethods: ['ach', 'wire', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'wire',
  }),
];

function normalizeSearchValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildSearchHaystack(profile: VendorDirectoryProfile) {
  return [
    profile.canonicalName,
    ...(profile.aliases || []),
    profile.locationId,
    profile.taxId,
    profile.remitAddress,
    profile.phone,
    profile.organizationClass,
  ]
    .filter(Boolean)
    .map((value) => normalizeSearchValue(String(value)));
}

function scoreProfile(profile: VendorDirectoryProfile, normalizedQuery: string) {
  const haystack = buildSearchHaystack(profile);
  const canonical = normalizeSearchValue(profile.canonicalName);
  const aliases = (profile.aliases || []).map(normalizeSearchValue);

  if (canonical === normalizedQuery) {
    return 1000;
  }

  if (aliases.includes(normalizedQuery)) {
    return 900;
  }

  if (canonical.startsWith(normalizedQuery)) {
    return 800;
  }

  if (aliases.some((alias) => alias.startsWith(normalizedQuery))) {
    return 700;
  }

  if (haystack.some((value) => value.includes(normalizedQuery))) {
    return 500;
  }

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const tokenMatches = queryTokens.reduce((count, token) => {
    return count + (haystack.some((value) => value.includes(token)) ? 1 : 0);
  }, 0);

  if (tokenMatches > 0) {
    return 100 + tokenMatches * 20;
  }

  return 0;
}

function buildPresetProfile(query: string): VendorDirectoryProfile | null {
  const presetMatch = resolveVendorProviderPreset(query);
  if (!presetMatch) {
    return null;
  }

  return {
    id: `preset-${presetMatch.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    sourceLabel: 'ClearFlow Preset',
    sourceType: 'preset_profile',
    canonicalName: presetMatch.canonicalName,
    organizationClass: presetMatch.organizationClass,
    remitAddress: presetMatch.remitAddress,
    phone: presetMatch.phone,
    referenceLinks: presetMatch.referenceLinks,
    acceptedReceiveMethods: presetMatch.acceptedReceiveMethods,
    defaultReceiveMethod: presetMatch.defaultReceiveMethod,
    deliveryDescriptor: presetMatch.deliveryDescriptor,
  };
}

export function searchVendorDirectory(query: string) {
  const normalized = normalizeSearchValue(query);
  if (!normalized) {
    return [];
  }

  const matches = VENDOR_DIRECTORY
    .map((profile) => ({
      profile,
      score: scoreProfile(profile, normalized),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.profile.canonicalName.localeCompare(right.profile.canonicalName))
    .map((entry) => entry.profile);

  const presetProfile = buildPresetProfile(query);

  return [presetProfile, ...matches]
    .filter((profile): profile is VendorDirectoryProfile => Boolean(profile))
    .filter(
      (profile, index, all) =>
        all.findIndex((candidate) => candidate.id === profile.id) === index,
    );
}

export function getFeaturedVendorDirectoryProfiles() {
  return VENDOR_DIRECTORY.slice(0, 12);
}
