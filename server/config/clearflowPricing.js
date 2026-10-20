// Clear.Flow launch pricing and onboarding policy.
// Monetary values are integer cents. Never trust browser-supplied amounts at checkout.
export const CLEARFLOW_PRICING = Object.freeze({
  currency: 'USD',
  guided: Object.freeze({
    id: 'guided',
    name: 'Guided onboarding',
    upfrontCents: 33300,
    onboardingServiceCents: 30000,
    includedFirstMonthCents: 3300,
    recurringMonthlyCents: 3300,
    includedMonths: 1,
    recurringStartsAfterIncludedMonth: true,
  }),
});
export const ONBOARDING_STAGES = Object.freeze([
  'registered', 'agreement_pending', 'payment_pending', 'paid',
  'intake_pending', 'ready_to_schedule', 'scheduled',
  'in_progress', 'completed', 'canceled',
]);
export const ADMIN_ROLES = Object.freeze({
  owner: 'owner',
  onboardingSpecialist: 'onboarding_specialist',
  customer: 'customer',
});
export const ASSIGNMENT_POLICY = Object.freeze({
  mode: 'round_robin',
  requiresAvailableCapacity: true,
  specialists: ['owner', 'jen'],
});
// Payment provider must confirm a signed webhook before moving a customer to paid.
// Contract acceptance must store the immutable terms version, timestamp and signer identity.
// Customer cancellation stops future renewals; never fabricate a 12-month receivable.
// Failed payments trigger notices and a grace period, not immediate irreversible deletion.
