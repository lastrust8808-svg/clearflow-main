import { isRoutingNumberEligible } from '../utils/routingValidator.js';

export function decideRail(input) {
  const { payee, amount, urgency, risk, userPreference } = input;

  if (risk.signalDecision === 'REROUTE' || risk.signalDecision === 'REVIEW') {
    return {
      rail: 'Fedwire',
      reason: `High risk detected by Signal (${risk.signalDecision}). Rerouting to a final, non-reversible rail is required.`,
      required_fields: ['payee_bank_name', 'payee_bank_address', 'payee_address'],
    };
  }

  if (
    (urgency === 'instant' || userPreference === 'FedNow') &&
    isRoutingNumberEligible(payee.routingNumber, 'FedNow')
  ) {
    return {
      rail: 'FedNow',
      reason: 'Instant payment requested and payee institution supports FedNow.',
      required_fields: ['payee_name', 'payee_account_number'],
    };
  }

  if (
    (urgency === 'instant' || userPreference === 'RTP') &&
    isRoutingNumberEligible(payee.routingNumber, 'RTP')
  ) {
    return {
      rail: 'RTP',
      reason: 'Instant payment requested and payee institution supports RTP.',
      required_fields: ['payee_name', 'payee_account_number'],
    };
  }

  if (amount > 100000 || urgency === 'final' || userPreference === 'Fedwire') {
    if (isRoutingNumberEligible(payee.routingNumber, 'Fedwire')) {
      return {
        rail: 'Fedwire',
        reason: 'Transaction is high-value or requires immediate finality.',
        required_fields: ['payee_bank_name', 'payee_bank_address', 'payee_address'],
      };
    }
  }

  const now = new Date();
  const isBusinessHours = now.getHours() >= 9 && now.getHours() <= 17;
  if (
    amount <= 1000000 &&
    isBusinessHours &&
    (urgency === 'same_day' || userPreference === 'SameDayACH')
  ) {
    if (isRoutingNumberEligible(payee.routingNumber, 'FedACH')) {
      return {
        rail: 'SameDayACH',
        reason: 'Defaulting to Same Day ACH based on amount and business hours.',
        required_fields: ['payee_name', 'payee_account_number'],
      };
    }
  }

  if (isRoutingNumberEligible(payee.routingNumber, 'FedACH')) {
    return {
      rail: 'StandardACH',
      reason: 'Default rail for non-urgent payments.',
      required_fields: ['payee_name', 'payee_account_number'],
    };
  }

  return {
    rail: 'None',
    reason: `No eligible payment rail could be determined for routing number ${payee.routingNumber}.`,
    required_fields: [],
  };
}
