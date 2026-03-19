// server/policy/railPolicy.ts
// Implements the decision logic for selecting the appropriate payment funding rail.

import { RailInfo, RailPolicyDecision, RailPolicyInput } from '../types.js';
import { isRoutingNumberEligible } from '../utils/routingValidator.js';

/**
 * Implements the core business logic for selecting a payment rail.
 * 
 * @param input - The parameters for the decision, including amount, urgency, and risk.
 * @returns A decision object specifying the chosen rail and the reason.
 */
export function decideRail(input: RailPolicyInput): RailPolicyDecision {
  const { payee, amount, urgency, risk, userPreference } = input;

  // Rule 0: Risk-based override. If Signal flags for rerouting, force a secure, non-reversible rail.
  if (risk.signalDecision === 'REROUTE' || risk.signalDecision === 'REVIEW') {
    return {
      rail: 'Fedwire',
      reason: `High risk detected by Signal (${risk.signalDecision}). Rerouting to a final, non-reversible rail is required.`,
      required_fields: ['payee_bank_name', 'payee_bank_address', 'payee_address'],
    };
  }

  // Rule 1: Instant payment requested, check for FedNow support first.
  if ((urgency === 'instant' || userPreference === 'FedNow') && isRoutingNumberEligible(payee.routingNumber, 'FedNow')) {
    return {
      rail: 'FedNow',
      reason: 'Instant payment requested and payee institution supports FedNow.',
      required_fields: ['payee_name', 'payee_account_number'],
    };
  }

  // Rule 2: Instant payment requested, check for RTP as a fallback.
  if ((urgency === 'instant' || userPreference === 'RTP') && isRoutingNumberEligible(payee.routingNumber, 'RTP')) {
    return {
      rail: 'RTP',
      reason: 'Instant payment requested and payee institution supports RTP.',
      required_fields: ['payee_name', 'payee_account_number'],
    };
  }

  // Rule 3: High-value or finality-driven transactions.
  // FIX: Changed 'Wire' to 'Fedwire' to match the 'SupportedRail' type definition.
  if (amount > 100000 || urgency === 'final' || userPreference === 'Fedwire') {
    if (isRoutingNumberEligible(payee.routingNumber, 'Fedwire')) {
       return {
        rail: 'Fedwire',
        reason: 'Transaction is high-value or requires immediate finality.',
        required_fields: ['payee_bank_name', 'payee_bank_address', 'payee_address'],
      };
    }
    // Note: Add logic for CHIPS or other high-value rails if applicable.
  }
  
  // Rule 4: Default to ACH for standard, non-urgent payments.
  // Check if Same Day ACH is possible based on amount thresholds and processing windows.
  const now = new Date();
  const isBusinessHours = now.getHours() >= 9 && now.getHours() <= 17; // Simplified check
  if (amount <= 1000000 && isBusinessHours && (urgency === 'same_day' || userPreference === 'SameDayACH')) {
     if (isRoutingNumberEligible(payee.routingNumber, 'FedACH')) {
      return {
        rail: 'SameDayACH',
        reason: 'Defaulting to Same Day ACH based on amount and business hours.',
        required_fields: ['payee_name', 'payee_account_number'],
      };
    }
  }

  // Rule 5: Fallback to standard ACH.
  if (isRoutingNumberEligible(payee.routingNumber, 'FedACH')) {
    return {
      rail: 'StandardACH',
      reason: 'Default rail for non-urgent payments.',
      required_fields: ['payee_name', 'payee_account_number'],
    };
  }

  // Final fallback: No eligible rail found.
  return {
    rail: 'None',
    reason: `No eligible payment rail could be determined for routing number ${payee.routingNumber}.`,
    required_fields: [],
  };
}
