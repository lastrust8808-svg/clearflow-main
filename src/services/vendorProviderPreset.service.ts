export interface VendorProviderPreset {
  canonicalName: string;
  matchedAlias: string;
  phone?: string;
  remitAddress?: string;
  notes?: string;
  organizationClass?:
    | 'general'
    | 'large_bank'
    | 'large_corporation'
    | 'utility'
    | 'government'
    | 'servicer';
  termsIntakeMode?: 'none' | 'auto_load' | 'upload_contract' | 'manual_reference';
  billingErrorSupport?: boolean;
  disputeResolutionPath?:
    | 'none'
    | 'notice_and_cure'
    | 'notice_mediation_arbitration'
    | 'notice_arbitration'
    | 'court_litigation';
  arbitrationForum?: 'aaa' | 'jams' | 'private_forum' | 'court_only' | 'unspecified';
  mediationStepPresent?: boolean;
  cureOfferRequired?: boolean;
  remittanceApplicationRule?: string;
  returnInstrumentRule?: string;
  billingErrorProcess?: string;
  contractExtractionSummary?: string;
  referenceLinks?: string[];
  lineOfCreditEnabled?: boolean;
  creditLineType?: 'revolving_trade' | 'term_vendor' | 'utility_credit' | 'service_contract';
  autoAnnualizeFromBills?: boolean;
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

function normalizeVendorName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const DTE_REFERENCE_LINKS = [
  'https://www.dteenergy.com/us/en/residential/customer-service/billing-and-payments/ways-to-pay.html',
  'https://www.dteenergy.com/us/en/contact-us.html',
  'https://www.dteenergy.com/us/en/legal/terms-and-conditions.html',
];

const DTE_PRESET: Omit<VendorProviderPreset, 'matchedAlias'> & { aliases: string[] } = {
  canonicalName: 'DTE Energy',
  aliases: ['dte', 'dte energy', 'dte electric', 'dte gas'],
  phone: '800-477-4747',
  remitAddress: 'DTE Energy, P.O. Box 740786, Cincinnati, OH 45274-0786',
  notes:
    'Major Michigan electric and natural gas utility. Utility coupon and bill uploads should carry the customer account number and processing code as statement-level identifiers rather than as a global vendor bank ABA.',
  organizationClass: 'utility',
  termsIntakeMode: 'auto_load',
  billingErrorSupport: true,
  disputeResolutionPath: 'notice_and_cure',
  arbitrationForum: 'unspecified',
  mediationStepPresent: false,
  cureOfferRequired: true,
  remittanceApplicationRule:
    'Apply remittances by DTE account number, service address, due date, and any coupon processing code shown on the statement or remittance coupon.',
  returnInstrumentRule:
    'Track returned or unsupported remittances against the DTE account reference and statement cycle, then retain the coupon or bill image with the rejection outcome.',
  billingErrorProcess:
    'Start a utility billing-error or payment-research notice using the saved DTE remit address, customer-service phone, account reference, and statement support.',
  contractExtractionSummary:
    'Auto-loaded DTE utility profile from published DTE payment, contact, and legal reference pages. Statement-level account and coupon identifiers should be captured from each uploaded bill or remittance coupon.',
  referenceLinks: DTE_REFERENCE_LINKS,
  lineOfCreditEnabled: true,
  creditLineType: 'utility_credit',
  autoAnnualizeFromBills: true,
  acceptedReceiveMethods: ['lockbox_coupon', 'paper_check', 'manual_review'],
  defaultReceiveMethod: 'lockbox_coupon',
  deliveryDescriptor:
    'DTE remittances are typically applied through statement coupon and remit-address workflows using the account and processing identifiers printed on the bill.',
};

const PRESETS = [DTE_PRESET];

export function resolveVendorProviderPreset(
  vendorName: string | null | undefined,
): VendorProviderPreset | null {
  const normalized = normalizeVendorName(vendorName || '');
  if (!normalized) {
    return null;
  }

  for (const preset of PRESETS) {
    const matchedAlias = preset.aliases.find((alias) => {
      const normalizedAlias = normalizeVendorName(alias);
      return normalized === normalizedAlias || normalized.includes(normalizedAlias);
    });

    if (matchedAlias) {
      return {
        matchedAlias,
        canonicalName: preset.canonicalName,
        phone: preset.phone,
        remitAddress: preset.remitAddress,
        notes: preset.notes,
        organizationClass: preset.organizationClass,
        termsIntakeMode: preset.termsIntakeMode,
        billingErrorSupport: preset.billingErrorSupport,
        disputeResolutionPath: preset.disputeResolutionPath,
        arbitrationForum: preset.arbitrationForum,
        mediationStepPresent: preset.mediationStepPresent,
        cureOfferRequired: preset.cureOfferRequired,
        remittanceApplicationRule: preset.remittanceApplicationRule,
        returnInstrumentRule: preset.returnInstrumentRule,
        billingErrorProcess: preset.billingErrorProcess,
        contractExtractionSummary: preset.contractExtractionSummary,
        referenceLinks: preset.referenceLinks,
        lineOfCreditEnabled: preset.lineOfCreditEnabled,
        creditLineType: preset.creditLineType,
        autoAnnualizeFromBills: preset.autoAnnualizeFromBills,
        acceptedReceiveMethods: preset.acceptedReceiveMethods,
        defaultReceiveMethod: preset.defaultReceiveMethod,
        deliveryDescriptor: preset.deliveryDescriptor,
      };
    }
  }

  return null;
}
