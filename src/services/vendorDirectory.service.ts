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

const VENDOR_DIRECTORY: VendorDirectoryProfile[] = [
  {
    id: 'dir-dte-energy',
    sourceLabel: 'ClearFlow Payee Directory',
    sourceType: 'directory_profile',
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
  },
  {
    id: 'dir-verizon',
    sourceLabel: 'ClearFlow Payee Directory',
    sourceType: 'directory_profile',
    canonicalName: 'Verizon',
    aliases: ['verizon', 'verizon wireless', 'verizon business'],
    organizationClass: 'utility',
    locationId: 'VERIZON-LOCKBOX',
    publicProfileUrl: 'https://www.verizon.com/business/support/pay-bill-faqs/',
    acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'ach', 'manual_review'],
    defaultReceiveMethod: 'lockbox_coupon',
  },
  {
    id: 'dir-att',
    sourceLabel: 'ClearFlow Payee Directory',
    sourceType: 'directory_profile',
    canonicalName: 'AT&T',
    aliases: ['att', 'at&t', 'att wireless', 'at&t business'],
    organizationClass: 'utility',
    locationId: 'ATT-LOCKBOX',
    publicProfileUrl: 'https://www.att.com/support/article/my-account/KM1008836/',
    acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'ach', 'manual_review'],
    defaultReceiveMethod: 'lockbox_coupon',
  },
  {
    id: 'dir-chase',
    sourceLabel: 'ClearFlow Payee Directory',
    sourceType: 'directory_profile',
    canonicalName: 'JPMorgan Chase Bank, N.A.',
    aliases: ['chase', 'jpmorgan chase', 'chase bank'],
    organizationClass: 'large_bank',
    locationId: 'CHASE-REMIT',
    publicProfileUrl: 'https://www.chase.com/',
    acceptedReceiveMethods: ['ach', 'wire', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  },
  {
    id: 'dir-bankofamerica',
    sourceLabel: 'ClearFlow Payee Directory',
    sourceType: 'directory_profile',
    canonicalName: 'Bank of America, N.A.',
    aliases: ['bank of america', 'bofa', 'boa'],
    organizationClass: 'large_bank',
    locationId: 'BOFA-REMIT',
    publicProfileUrl: 'https://www.bankofamerica.com/',
    acceptedReceiveMethods: ['ach', 'wire', 'paper_check', 'manual_review'],
    defaultReceiveMethod: 'ach',
  },
];

function normalizeSearchValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function searchVendorDirectory(query: string) {
  const normalized = normalizeSearchValue(query);
  if (!normalized) {
    return [];
  }

  const matches = VENDOR_DIRECTORY.filter((profile) => {
    const haystack = [
      profile.canonicalName,
      ...(profile.aliases || []),
      profile.locationId,
      profile.taxId,
      profile.remitAddress,
      profile.phone,
    ]
      .filter(Boolean)
      .map((value) => normalizeSearchValue(String(value)))
      .join(' ');

    return haystack.includes(normalized);
  });

  const presetMatch = resolveVendorProviderPreset(query);
  if (!presetMatch) {
    return matches;
  }

  const presetProfile: VendorDirectoryProfile = {
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

  return [presetProfile, ...matches].filter(
    (profile, index, all) => all.findIndex((candidate) => candidate.id === profile.id) === index
  );
}
