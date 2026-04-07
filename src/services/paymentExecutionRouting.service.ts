import type { VendorRecord, VendorReceiveMethod } from '../types/core';
import {
  classifyVendorExecutionPath,
  deriveVendorPaymentRailProfile,
} from './vendorPaymentRails.service';
import type { SettlementExecutionCapabilitiesResponse } from './settlementExecution.service';

export interface RoutedVendorReceiveMethodOption {
  method: VendorReceiveMethod;
  enabled: boolean;
  reason: string;
}

export interface PaymentExecutionRoutingDecision {
  executionClass: 'bank_funds_transfer' | 'account_application' | 'manual_review';
  defaultReceiveMethod: VendorReceiveMethod;
  allowedMethods: RoutedVendorReceiveMethodOption[];
  guidance: string;
  liveExecutionAvailable: boolean;
  stagedOnly: boolean;
}

const BANK_METHODS: VendorReceiveMethod[] = ['ach', 'wire'];
const BILLER_DIRECT_METHODS: VendorReceiveMethod[] = ['lockbox_coupon', 'paper_check'];

export function buildPaymentExecutionRoutingDecision(
  vendor: Pick<
    VendorRecord,
    'name' | 'remitAddress' | 'paymentInstructions' | 'counterpartyTermsProfile'
  > | undefined,
  capabilities:
    | SettlementExecutionCapabilitiesResponse['capabilities']
    | null
    | undefined,
): PaymentExecutionRoutingDecision {
  const profile = deriveVendorPaymentRailProfile(vendor);
  const defaultClassification = classifyVendorExecutionPath(vendor, profile.defaultReceiveMethod);

  const allowedMethods = profile.acceptedReceiveMethods.map((receiveMethod) => {
    if (BANK_METHODS.includes(receiveMethod)) {
      const bankMethodSupported =
        receiveMethod === 'ach'
          ? Boolean(capabilities?.achOriginationReady)
          : Boolean(capabilities?.wireOriginationReady);
      return {
        method: receiveMethod,
        enabled: bankMethodSupported,
        reason: bankMethodSupported
          ? 'Live bank-originated execution is available for this payee method.'
          : `${receiveMethod.toUpperCase()} execution is not enabled in the current treasury provider posture.`,
      };
    }

    if (BILLER_DIRECT_METHODS.includes(receiveMethod)) {
      return {
        method: receiveMethod,
        enabled: true,
        reason:
          receiveMethod === 'paper_check' && capabilities?.printableCheckReady
            ? capabilities?.positivePayReady
              ? 'Printable check issue is available and can be paired with a Positive Pay support record before delivery.'
              : 'Printable check issue is available, but Positive Pay is not enabled in the current posture.'
            : capabilities?.billerDirectReady
              ? 'Dedicated biller-direct execution is configured.'
              : 'This biller-direct path can be retained and staged now, but true biller-direct execution still needs a dedicated biller or bank-bill-pay rail.',
      };
    }

    if (receiveMethod === 'digital_wallet') {
      return {
        method: receiveMethod,
        enabled: true,
        reason:
          'Digital wallet settlement depends on the saved wallet instructions and execution support on the connected wallet.',
      };
    }

    return {
      method: receiveMethod,
      enabled: true,
      reason:
        'Manual review is still available when the payee does not yet have a fully executable receiving path.',
    };
  });

  const firstEnabledMethod =
    allowedMethods.find((option) => option.enabled)?.method || profile.defaultReceiveMethod;
  const resolvedClassification = classifyVendorExecutionPath(vendor, firstEnabledMethod);
  const liveExecutionAvailable = allowedMethods.some(
    (option) => option.enabled && BANK_METHODS.includes(option.method),
  );
  const stagedOnly =
    resolvedClassification.executionClass === 'account_application' &&
    !Boolean(capabilities?.billerDirectReady);

  let guidance = resolvedClassification.detail;
  if (resolvedClassification.executionClass === 'bank_funds_transfer') {
    guidance = liveExecutionAvailable
      ? `${resolvedClassification.detail} ClearFlow can submit this through the connected bank execution rail when the funding account is eligible.`
      : `${resolvedClassification.detail} This payee is bank-oriented, but the current environment is not ready to originate that transfer live yet.`;
  } else if (resolvedClassification.executionClass === 'account_application') {
    guidance = stagedOnly
      ? `${resolvedClassification.detail} ClearFlow will retain the remittance, account references, and proof chain, but final biller-direct delivery still needs a dedicated biller or bank-bill-pay rail.`
      : `${resolvedClassification.detail} Dedicated biller-direct execution is available for this payee class.`;
  }

  return {
    executionClass: resolvedClassification.executionClass,
    defaultReceiveMethod: firstEnabledMethod,
    allowedMethods,
    guidance,
    liveExecutionAvailable,
    stagedOnly,
  };
}
