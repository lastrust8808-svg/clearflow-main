import type {
  BankAccountRecord,
  EntityRecord,
  FundsApplicationClass,
  FundsRightsClassification,
  PaymentRecord,
  VendorRecord,
} from '../types/core';

type PaymentMethod = PaymentRecord['method'];
type VendorReceiveMethod = PaymentRecord['vendorReceiveMethod'];

interface ResolvePaymentRightsInput {
  entity?: EntityRecord | null;
  sourceBankAccount?: BankAccountRecord | null;
  method: PaymentMethod;
  vendorReceiveMethod?: VendorReceiveMethod;
  direction: PaymentRecord['direction'];
  counterpartyType: PaymentRecord['counterpartyType'];
  vendor?: VendorRecord | null;
  requestedClassification?: FundsRightsClassification;
}

export interface PaymentRightsResolution {
  rightsClassification: FundsRightsClassification;
  applicationClass: FundsApplicationClass;
  summary: string;
}

export function formatFundsRightsClassification(value?: FundsRightsClassification | null) {
  switch (value) {
    case 'consumer_household':
      return 'Consumer / household';
    case 'commercial_business':
      return 'Commercial / business';
    case 'fiduciary_administrative':
      return 'Fiduciary / administrative';
    case 'mixed_review':
      return 'Mixed / review';
    default:
      return 'Unclassified';
  }
}

export function formatFundsApplicationClass(value?: FundsApplicationClass | null) {
  switch (value) {
    case 'consumer_ppd':
      return 'Consumer PPD';
    case 'consumer_web':
      return 'Consumer WEB';
    case 'consumer_tel':
      return 'Consumer TEL';
    case 'commercial_ccd':
      return 'Commercial CCD';
    case 'commercial_ctx':
      return 'Commercial CTX';
    case 'fiduciary_admin':
      return 'Fiduciary admin';
    case 'check_issue':
      return 'Check issue';
    case 'biller_direct_review':
      return 'Biller-direct review';
    case 'manual_review':
      return 'Manual review';
    default:
      return 'Unclassified';
  }
}

export function resolveDefaultFundsRightsClassification({
  entity,
  sourceBankAccount,
  requestedClassification,
}: Pick<ResolvePaymentRightsInput, 'entity' | 'sourceBankAccount' | 'requestedClassification'>) {
  if (requestedClassification) {
    return requestedClassification;
  }

  if (sourceBankAccount?.fundsRightsClassification) {
    return sourceBankAccount.fundsRightsClassification;
  }

  if (!entity) {
    return 'mixed_review';
  }

  if (entity.type === 'individual') {
    return 'consumer_household';
  }

  if (entity.type === 'trust') {
    return 'fiduciary_administrative';
  }

  return 'commercial_business';
}

export function resolvePaymentRightsClassification(
  input: ResolvePaymentRightsInput,
): PaymentRightsResolution {
  const rightsClassification = resolveDefaultFundsRightsClassification(input);

  if (input.method === 'check') {
    return {
      rightsClassification,
      applicationClass: 'check_issue',
      summary:
        'Check issue uses issued-check controls, presentment, and exception handling rather than ACH authorization classes.',
    };
  }

  if (
    input.vendorReceiveMethod === 'lockbox_coupon' ||
    input.vendor?.counterpartyTermsProfile?.organizationClass === 'utility' ||
    input.vendor?.counterpartyTermsProfile?.organizationClass === 'servicer'
  ) {
    return {
      rightsClassification,
      applicationClass: 'biller_direct_review',
      summary:
        'Biller-direct payments need account-application validation and should not be treated as ordinary bank-beneficiary ACH just because funds may originate from a bank.',
    };
  }

  if (input.method === 'ach') {
    if (rightsClassification === 'consumer_household') {
      return {
        rightsClassification,
        applicationClass: 'consumer_ppd',
        summary:
          'Consumer-household ACH should stay in a consumer authorization class and consumer-protection workflow unless a different origin channel is explicitly documented.',
      };
    }

    if (rightsClassification === 'fiduciary_administrative') {
      return {
        rightsClassification,
        applicationClass: 'fiduciary_admin',
        summary:
          'Fiduciary or administrative accounts need separate operational review because they are not ordinary household consumer accounts and should not be blended into generic business handling.',
      };
    }

    return {
      rightsClassification,
      applicationClass: 'commercial_ccd',
      summary:
        'Commercial ACH should use a business-originated posture and business control workflow, not consumer EFT assumptions.',
    };
  }

  if (input.method === 'wire') {
    return {
      rightsClassification,
      applicationClass:
        rightsClassification === 'commercial_business' ? 'commercial_ctx' : 'manual_review',
      summary:
        'Wire rights and exception posture should be tracked by rights class, source account, and payee relationship rather than assumed to match ACH or card behavior.',
    };
  }

  return {
    rightsClassification,
    applicationClass: 'manual_review',
    summary:
      'This payment method needs manual review of rights posture and authorization class before external execution assumptions are made.',
  };
}
