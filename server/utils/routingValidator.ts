// server/utils/routingValidator.ts
// Utilities for validating routing numbers and checking rail eligibility.

/**
 * Validates a 9-digit ABA routing number using the check-digit algorithm.
 * @param routingNumber - The 9-digit routing number as a string.
 * @returns True if the routing number is valid, false otherwise.
 */
export function isValidRoutingNumber(routingNumber: string): boolean {
  if (!/^\d{9}$/.test(routingNumber)) {
    return false;
  }

  const digits = routingNumber.split('').map(Number);
  const checksum =
    3 * (digits[0] + digits[3] + digits[6]) +
    7 * (digits[1] + digits[4] + digits[7]) +
    1 * (digits[2] + digits[5] + digits[8]);

  return checksum % 10 === 0;
}

/**
 * Placeholder for checking if a routing number is eligible for a specific rail.
 * In a real application, this would query a database populated from FRB E-Payments
 * and FedNow participant directories.
 * 
 * @param routingNumber - The 9-digit routing number.
 * @param rail - The payment rail to check ('FedNow', 'RTP', 'Fedwire', 'FedACH').
 * @returns True if the routing number is eligible, false otherwise.
 */
export function isRoutingNumberEligible(routingNumber: string, rail: 'FedNow' | 'RTP' | 'Fedwire' | 'FedACH'): boolean {
  if (!isValidRoutingNumber(routingNumber)) {
    return false;
  }
  
  // --- MOCK IMPLEMENTATION ---
  // In production, you would look this up in your 'rails_directory' table.
  // For this example, we'll use simple heuristics.
  switch (rail) {
    case 'FedNow':
    case 'RTP':
      // Assume modern banks (routing number starts with 0 or 1) support instant payments.
      return routingNumber.startsWith('0') || routingNumber.startsWith('1');
    case 'Fedwire':
    case 'FedACH':
      // Assume all valid routing numbers support ACH and Wire.
      return true;
    default:
      return false;
  }
}

/**
 * Placeholder for ingesting and updating the rail directory from FRB sources.
 * This function would be run as a scheduled background job.
 */
export async function updateRailDirectory() {
  console.log("Starting update of rail directory...");
  // 1. Download FRB E-Payments Routing Directory (via FedLine).
  // 2. Download FedNow participant list (publicly available).
  // 3. Download RTP participant list (from TCH).
  // 4. Parse the files and update the 'rails_directory' table in the database.
  console.log("Rail directory update complete.");
  // This is a placeholder and does not perform a real update.
}