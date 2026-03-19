import { CreditTransactionInput, RegZScopeDecision, RegZComplianceModule } from '../types/app.models';

// Threshold Exemption Table (Rule 5)
// This table stores the annually adjusted threshold for exempting consumer credit transactions.
// It should be updated each year based on CFPB announcements.
const REGZ_THRESHOLDS: { [year: number]: number } = {
  2026: 73400, // Provided by user
  2025: 73700, // Based on public data
  2024: 69500, // Based on public data
  2023: 66400, // Based on public data
  2022: 61000, // Based on public data
};

class RegZScopeEngine {

  /**
   * Determines if a given credit transaction falls under the scope of Regulation Z.
   * @param input The details of the credit transaction.
   * @returns A detailed decision object.
   */
  public determineScope(input: CreditTransactionInput): RegZScopeDecision {
    const decision: RegZScopeDecision = {
      isCoveredByRegZ: false,
      reasonCode: 'INIT',
      reasonDescription: 'Decision process initiated.',
      requiredComplianceModules: [],
      notes: [],
    };

    // --- RULE 2: Credit Card Special Handling ---
    // Certain rules for credit cards apply regardless of whether the credit is for
    // consumer or business purposes. These are handled first.
    if (input.creditProductType === 'credit-card') {
      decision.requiredComplianceModules.push('Unauthorized-Use-Liability', 'Issuance-Rules');

      // If the card program is explicitly for business, it's exempt from all other Reg Z provisions.
      if (input.cardProgramDetails?.programPurpose === 'business') {
        decision.isCoveredByRegZ = false;
        decision.reasonCode = 'EXEMPT_BUSINESS_CARD_PROGRAM';
        decision.reasonDescription = 'Credit card program for business purposes is exempt from Reg Z, except for rules on issuance and liability for unauthorized use (1026.12).';
        return decision;
      }
    }

    // --- Determine Primary Purpose (Rules 1, 3, 4) ---
    const purposeResult = this.evaluatePrimaryPurpose(input);

    if (!purposeResult.isConsumer) {
      decision.isCoveredByRegZ = false;
      decision.reasonCode = purposeResult.reasonCode;
      decision.reasonDescription = purposeResult.reasonDescription;
      // Note: The card liability modules are intentionally kept even if the purpose is business.
      return decision;
    }

    // --- At this point, we have established a consumer purpose. The transaction is covered unless an exemption applies. ---
    decision.isCoveredByRegZ = true;
    decision.reasonCode = purposeResult.reasonCode;
    decision.reasonDescription = purposeResult.reasonDescription;
    
    // Assign base compliance modules for all consumer credit.
    const uniqueModules = new Set<RegZComplianceModule>(decision.requiredComplianceModules);
    uniqueModules.add('Disclosures-General');
    if (input.creditProductType === 'credit-card' || input.creditProductType === 'open-end') {
      uniqueModules.add('Billing-Error-Resolution');
    }
    decision.requiredComplianceModules = Array.from(uniqueModules);
    
    // --- Check for Exemptions applicable to consumer-purpose credit ---
    const year = new Date(input.transactionDate).getFullYear();
    const threshold = REGZ_THRESHOLDS[year] || REGZ_THRESHOLDS[2026]; // Fallback to latest known

    // --- RULE 5: Threshold Exemption ---
    // Does not apply if the credit is secured by real property.
    if (!input.isSecuredByRealProperty && input.amount > threshold) {
      decision.isCoveredByRegZ = false;
      decision.reasonCode = 'EXEMPT_THRESHOLD_AMOUNT';
      decision.reasonDescription = `Transaction amount of $${input.amount} exceeds the ${year} threshold of $${threshold}.`;
      // For exempt transactions, only the specific card rules apply if it's a card.
      if (input.creditProductType === 'credit-card') {
         decision.requiredComplianceModules = ['Unauthorized-Use-Liability', 'Issuance-Rules'];
      } else {
         decision.requiredComplianceModules = [];
      }
      return decision;
    }
    
    // --- RULE 6: Open-End Plan Exemption ---
    // Does not apply if the plan is secured by real property.
    // FIX: A credit card is a type of open-end plan. The condition must check for both to correctly apply the exemption logic.
    if ((input.creditProductType === 'open-end' || input.creditProductType === 'credit-card') && !input.isSecuredByRealProperty) {
      if ((input.initialExtensionAmount && input.initialExtensionAmount > threshold) ||
          (input.firmCommitmentAmount && input.firmCommitmentAmount > threshold)) {
          decision.isCoveredByRegZ = false;
          decision.reasonCode = 'EXEMPT_OPEN_END_COMMITMENT';
          decision.reasonDescription = `Open-end plan is exempt due to an initial extension or firm commitment at account opening exceeding the ${year} threshold of $${threshold}.`;
          decision.notes.push('If this plan later ceases to be exempt, Reg Z requirements must be applied going forward from that point within a reasonable time.');
          if (input.creditProductType === 'credit-card') {
            decision.requiredComplianceModules = ['Unauthorized-Use-Liability', 'Issuance-Rules'];
          } else {
            decision.requiredComplianceModules = [];
          }
          return decision;
      }
    }

    return decision;
  }

  /**
   * A helper to determine the primary purpose of the credit based on a hierarchy of rules.
   */
  private evaluatePrimaryPurpose(input: CreditTransactionInput): { isConsumer: boolean; reasonCode: string; reasonDescription: string } {
    // --- RULE 4: Rental Property Deeming Rules ---
    if (input.rentalPropertyDetails) {
      const details = input.rentalPropertyDetails;
      if (!details.isOwnerOccupied || (details.ownerOccupancyDaysNext12Months !== undefined && details.ownerOccupancyDaysNext12Months <= 14)) {
        return { isConsumer: false, reasonCode: 'DEEMED_BUSINESS_NON_OWNER_OCCUPIED_RENTAL', reasonDescription: 'Credit for non-owner-occupied rental property is deemed for business purpose.' };
      }
      if (details.isForAcquisition && details.numberOfUnits > 2) {
        return { isConsumer: false, reasonCode: 'DEEMED_BUSINESS_RENTAL_ACQUISITION', reasonDescription: 'Acquisition of an owner-occupied rental with more than 2 units is deemed for business purpose.' };
      }
      if (!details.isForAcquisition && details.numberOfUnits > 4) { // improve/maintain
        return { isConsumer: false, reasonCode: 'DEEMED_BUSINESS_RENTAL_MAINTENANCE', reasonDescription: 'Improvement of an owner-occupied rental with more than 4 units is deemed for business purpose.' };
      }
      // If owner-occupied and doesn't meet the business unit tests, it's consumer.
      return { isConsumer: true, reasonCode: 'COVERED_OWNER_OCCUPIED_RENTAL', reasonDescription: 'Credit for owner-occupied rental not meeting exemption criteria is for a consumer purpose.' };
    }

    // --- RULE 3: Trust Override ---
    if (input.borrowerType === 'trust' && input.trustDetails) {
      const isSpecialTrust = ['estate-planning', 'tax-planning', 'land-trust'].includes(input.trustDetails.trustType);
      const isConsumerTrustPurpose = ['personal', 'family', 'household'].includes(input.trustDetails.trustPurpose);
      if (isSpecialTrust && isConsumerTrustPurpose) {
        return { isConsumer: true, reasonCode: 'COVERED_CONSUMER_TRUST', reasonDescription: 'Credit to a qualifying trust for a personal, family, or household purpose is treated as consumer credit.' };
      }
    }

    // --- RULE 1: Primary Purpose Classification ---
    if (['business', 'commercial', 'agricultural', 'organizational'].includes(input.statedPurpose)) {
      return { isConsumer: false, reasonCode: 'EXEMPT_STATED_BUSINESS_PURPOSE', reasonDescription: 'Credit has a stated business, commercial, agricultural, or organizational purpose.' };
    }
    if (input.statedPurpose === 'consumer') {
      return { isConsumer: true, reasonCode: 'COVERED_STATED_CONSUMER_PURPOSE', reasonDescription: 'Credit has a stated consumer purpose.' };
    }

    // --- RULE 1 (Default Policy): If purpose is uncertain, default to consumer. ---
    return { isConsumer: true, reasonCode: 'COVERED_DEFAULT_POLICY', reasonDescription: 'Purpose is uncertain; defaulting to consumer credit as per policy.' };
  }
}

export const regZScopeEngine = new RegZScopeEngine();