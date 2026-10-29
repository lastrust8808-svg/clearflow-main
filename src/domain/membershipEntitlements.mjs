/**
 * Pure, non-posting membership entitlement projection.
 *
 * SECURITY BOUNDARY: verified: true is an input contract, NOT signature
 * verification. Only a server-side adapter that has authenticated the provider
 * webhook, validated the tenant/subscription binding, and durably stored the
 * event may call this projector. Never pass client-controlled events to it.
 * No payment requests, ledger postings, or external side effects occur here.
 */
const TYPES = new Set([
  'subscription_created', 'payment_succeeded', 'payment_failed',
  'payment_refunded', 'subscription_cancelled',
]);
const ORDER = {
  subscription_created: 0,
  payment_succeeded: 1,
  payment_failed: 2,
  payment_refunded: 3,
  subscription_cancelled: 4,
};

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(label + ' must be a nonempty string');
  }
  return value;
}

function instant(value, label) {
  required(value, label);
  // Date.parse silently normalizes invalid calendar dates (e.g. February 30)
  // and accepts 24:00 in some runtimes. Never let such timestamps affect
  // paid-through dates, replay identity, or entitlement expiry.
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) throw new TypeError(label + ' must be a valid ISO timestamp with timezone');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] ||
      Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59 ||
      (offsetHourText !== undefined && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59))) {
    throw new TypeError(label + ' is not a valid calendar timestamp');
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new TypeError(label + ' is not a valid timestamp');
  return ms;
}

/**
 * @param {{tenantId:string, memberId:string, subscriptionId:string}} scope
 * @param {Array<object>} events Already authenticated, provider-verified events.
 * @param {string} asOf Explicit ISO timestamp for deterministic expiry decisions.
 */
export function projectMembershipEntitlement(scope, events, asOf) {
  if (!scope || typeof scope !== 'object') throw new TypeError('scope is required');
  const tenantId = required(scope.tenantId, 'tenantId');
  const memberId = required(scope.memberId, 'memberId');
  const subscriptionId = required(scope.subscriptionId, 'subscriptionId');
  const cutoff = instant(asOf, 'asOf');
  if (!Array.isArray(events)) throw new TypeError('events must be an array');

  const seen = new Map();
  const settlements = new Map();
  const settledInvoices = new Map();
  const normalized = [];
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new TypeError('invalid membership event');
    }
    const id = required(event.id, 'event.id');
    if (event.tenantId !== tenantId || event.memberId !== memberId || event.subscriptionId !== subscriptionId) {
      throw new Error('membership event scope mismatch');
    }
    if (event.verified !== true) {
      throw new Error('unverified membership event');
    }
    if (!TYPES.has(event.type)) throw new Error('unsupported membership event type');
    const occurred = instant(event.occurredAt, 'event.occurredAt');
    const normalizedEvent = {
      id, tenantId, memberId, subscriptionId,
      type: event.type, occurredAt: event.occurredAt,
    };
    if (event.type.startsWith('payment_')) {
      normalizedEvent.invoiceId = required(event.invoiceId, 'event.invoiceId');
    }
    if (event.type === 'payment_succeeded') {
      normalizedEvent.settlementId = required(event.settlementId, 'event.settlementId');
      normalizedEvent.periodEnd = required(event.periodEnd, 'event.periodEnd');
      if (instant(normalizedEvent.periodEnd, 'event.periodEnd') <= occurred) {
        throw new Error('payment period must end after settlement event');
      }
    }
    const fingerprint = JSON.stringify(normalizedEvent);
    if (seen.has(id)) {
      if (seen.get(id) !== fingerprint) throw new Error('conflicting duplicate membership event');
      continue;
    }
    // A settlement is a unique economic event, not a reusable entitlement token.
    // A second webhook ID for the same settlement must neither extend the paid
    // period nor count as a second payment. Conflicting replays fail closed.
    if (event.type === 'payment_succeeded') {
      const prior = settlements.get(normalizedEvent.settlementId);
      if (prior) {
        if (prior.invoiceId !== normalizedEvent.invoiceId) {
          throw new Error('settlement reused across invoices');
        }
        if (prior.periodEnd !== normalizedEvent.periodEnd || prior.occurredAt !== normalizedEvent.occurredAt) {
          throw new Error('conflicting settlement replay');
        }
        seen.set(id, fingerprint);
        continue;
      }
      // A monthly invoice represents one fully settled obligation. A different
      // settlement ID for that invoice is not a second membership period.
      // Reject it instead of silently accepting a double settlement or
      // allowing a second webhook to extend the paid-through date.
      const priorInvoiceSettlement = settledInvoices.get(normalizedEvent.invoiceId);
      if (priorInvoiceSettlement && priorInvoiceSettlement !== normalizedEvent.settlementId) {
        throw new Error('invoice has multiple successful settlements');
      }
      settledInvoices.set(normalizedEvent.invoiceId, normalizedEvent.settlementId);
      settlements.set(normalizedEvent.settlementId, {
        invoiceId: normalizedEvent.invoiceId,
        periodEnd: normalizedEvent.periodEnd,
        occurredAt: normalizedEvent.occurredAt,
      });
    }
    seen.set(id, fingerprint);
    normalized.push({ ...normalizedEvent, occurred });
  }

  normalized.sort((a, b) => a.occurred - b.occurred || ORDER[a.type] - ORDER[b.type] || a.id.localeCompare(b.id));
  let status = 'pending';
  let periodEnd = null;
  let lastEventId = null;
  let processedEvents = 0;
  for (const event of normalized) {
    if (event.occurred > cutoff) continue;
    processedEvents += 1;
    lastEventId = event.id;
    if (status === 'cancelled') continue; // cancellation is terminal for this subscription ID
    switch (event.type) {
      case 'subscription_created':
        break; // never grants access, even if replayed after a payment
      case 'payment_succeeded':
        status = 'active';
        periodEnd = event.periodEnd;
        break;
      case 'payment_failed':
      case 'payment_refunded':
        status = 'past_due';
        break;
      case 'subscription_cancelled':
        status = 'cancelled';
        break;
    }
  }
  if (status === 'active' && instant(periodEnd, 'periodEnd') <= cutoff) {
    status = 'expired';
  }
  return Object.freeze({
    tenantId, memberId, subscriptionId, status,
    entitled: status === 'active', periodEnd, lastEventId, processedEvents,
  });
}
