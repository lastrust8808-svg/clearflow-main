// Explicit transfer-mode gate. No banking adapter is wired to B2B routes.
// Test mode is safe for synthetic transaction simulations only.
export function b2bPaymentMode(env = process.env) {
  const mode = env.CLEARFLOW_B2B_PAYMENT_MODE || 'disabled';
  if (mode === 'test') return 'test';
  return 'disabled';
}
export function evaluateB2BExecution({ mode = b2bPaymentMode(), authorization, providerAdapter }) {
  if (mode !== 'test') return Object.freeze({ allowed: false, reason: 'Live B2B execution is not configured.' });
  if (authorization?.approved !== true || !authorization?.payerEntityId ||
      !authorization?.invoiceId || !authorization?.actorId) {
    return Object.freeze({ allowed: false, reason: 'Verified payer authorization is required.' });
  }
  if (providerAdapter?.environment !== 'sandbox' || providerAdapter?.verified !== true) {
    return Object.freeze({ allowed: false, reason: 'Verified sandbox adapter required.' });
  }
  return Object.freeze({ allowed: true, simulationOnly: true, fundsMoved: false });
}
