import type { VendorReceiveMethod, VendorRecord } from '../types/core';

export interface VendorPaymentRailProfile {
  acceptedReceiveMethods: VendorReceiveMethod[];
  defaultReceiveMethod: VendorReceiveMethod;
  deliveryDescriptor: string;
}

export interface VendorExecutionClassification {
  executionClass: 'bank_funds_transfer' | 'account_application' | 'manual_review';
  label: string;
  detail: string;
}

export function deriveVendorPaymentRailProfile(
  vendor?: Pick<VendorRecord, 'name' | 'remitAddress' | 'paymentInstructions' | 'counterpartyTermsProfile'>,
): VendorPaymentRailProfile {
  const explicitMethods = vendor?.paymentInstructions?.acceptedReceiveMethods || [];
  if (explicitMethods.length) {
    return {
      acceptedReceiveMethods: explicitMethods,
      defaultReceiveMethod:
        vendor?.paymentInstructions?.defaultReceiveMethod || explicitMethods[0] || 'manual_review',
      deliveryDescriptor:
        vendor?.paymentInstructions?.deliveryDescriptor ||
        buildDeliveryDescriptor(vendor?.name, explicitMethods[0] || 'manual_review'),
    };
  }

  const methods: VendorReceiveMethod[] = [];
  const hasBankCoordinates = Boolean(
    vendor?.paymentInstructions?.routingNumber &&
      (vendor?.paymentInstructions?.accountMask || vendor?.paymentInstructions?.accountNumber),
  );
  const hasWirePreference = vendor?.paymentInstructions?.railPreference === 'wire';
  const hasUtilityLockbox =
    vendor?.counterpartyTermsProfile?.organizationClass === 'utility' && Boolean(vendor?.remitAddress);
  const hasRemitAddress = Boolean(vendor?.remitAddress);
  const hasDigitalWallet = Boolean(vendor?.paymentInstructions?.digitalWalletAddress);

  if (hasUtilityLockbox) {
    methods.push('lockbox_coupon');
  }
  if (hasBankCoordinates) {
    methods.push('ach');
    if (hasWirePreference) {
      methods.push('wire');
    }
  }
  if (hasRemitAddress) {
    methods.push('paper_check');
  }
  if (hasDigitalWallet) {
    methods.push('digital_wallet');
  }
  if (!methods.length) {
    methods.push('manual_review');
  }

  const uniqueMethods = methods.filter((value, index, all) => all.indexOf(value) === index);
  const defaultReceiveMethod =
    vendor?.paymentInstructions?.defaultReceiveMethod ||
    uniqueMethods[0] ||
    'manual_review';

  return {
    acceptedReceiveMethods: uniqueMethods,
    defaultReceiveMethod,
    deliveryDescriptor:
      vendor?.paymentInstructions?.deliveryDescriptor ||
      buildDeliveryDescriptor(vendor?.name, defaultReceiveMethod),
  };
}

export function buildDeliveryDescriptor(
  vendorName: string | undefined,
  method: VendorReceiveMethod,
): string {
  const label = vendorName || 'Vendor';
  switch (method) {
    case 'lockbox_coupon':
      return `${label} receives statement or coupon remittances through a mailed lockbox or remit address workflow.`;
    case 'paper_check':
      return `${label} receives mailed paper checks using the remit address on file.`;
    case 'wire':
      return `${label} receives wire settlement using saved bank instructions.`;
    case 'ach':
      return `${label} receives ACH or EFT settlement using saved bank instructions.`;
    case 'digital_wallet':
      return `${label} receives digital-asset settlement at the saved wallet address.`;
    default:
      return `${label} does not yet have a confirmed receive method and should stay in manual review.`;
  }
}

export function isVendorReceiveMethodSupported(
  vendor: Pick<VendorRecord, 'name' | 'remitAddress' | 'paymentInstructions' | 'counterpartyTermsProfile'> | undefined,
  method: VendorReceiveMethod,
) {
  return deriveVendorPaymentRailProfile(vendor).acceptedReceiveMethods.includes(method);
}

export function classifyVendorExecutionPath(
  vendor: Pick<VendorRecord, 'name' | 'remitAddress' | 'paymentInstructions' | 'counterpartyTermsProfile'> | undefined,
  method: VendorReceiveMethod | undefined,
): VendorExecutionClassification {
  const resolvedMethod = method || deriveVendorPaymentRailProfile(vendor).defaultReceiveMethod;

  switch (resolvedMethod) {
    case 'ach':
    case 'wire':
      return {
        executionClass: 'bank_funds_transfer',
        label: 'Bank funds transfer',
        detail: 'Direct bank or processor settlement to the payee’s receiving account.',
      };
    case 'lockbox_coupon':
    case 'paper_check':
      return {
        executionClass: 'account_application',
        label: 'Account application / biller-direct',
        detail:
          'Remittance is aimed at a billing account, coupon, lockbox, or posted account application workflow rather than a generic vendor bank payout.',
      };
    default:
      return {
        executionClass: 'manual_review',
        label: 'Manual review',
        detail:
          'The payee does not yet have a fully classified receive path, so communication and settlement should be reviewed before release.',
      };
  }
}
