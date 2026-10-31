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
  // Ambiguous or invisible billing identities must not become entitlement
  // keys. In particular, whitespace and Unicode formatting controls can
  // make distinct tenant, invoice, and settlement IDs look identical in logs.
  if (typeof value !== 'string' || !value.trim() || value.length > 255 ||
      value !== value.trim() || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) {
    throw new TypeError(label + ' must be a canonical nonempty string');
  }
  return value;
}

// Never let inherited "verified" flags, inherited tenant identities, accessors,
// or non-enumerable claims enter the trusted entitlement projection. The
// production adapter must still authenticate the provider and persist events.
function assertPlainMembershipRecord(value, label, requiredFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(label + ' must be a plain membership record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(label + ' must contain only own enumerable data fields');
    }
  }
  for (const field of requiredFields) {
    if (!Object.hasOwn(descriptors, field)) {
      throw new TypeError(label + ' is missing an own ' + field + ' field');
    }
  }
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

// Share the projector's canonical identity policy with test-only webhook admission.
// Neither validation nor fixture HMAC authenticates a production provider.
// Date.parse truncates fractional seconds beyond milliseconds. Preserve the
// remaining precision when ordering provider events and comparing paid-through
// boundaries, so a later microsecond event cannot be treated as simultaneous.
export function compareMembershipInstants(left, right) {
  const leftMs = instant(left, 'left timestamp');
  const rightMs = instant(right, 'right timestamp');
  if (leftMs !== rightMs) return leftMs < rightMs ? -1 : 1;
  const remainder = (value) => {
    const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? '';
    return fraction.padEnd(3, '0').slice(3);
  };
  const a = remainder(left), b = remainder(right);
  const width = Math.max(a.length, b.length);
  const paddedA = a.padEnd(width, '0'), paddedB = b.padEnd(width, '0');
  return paddedA < paddedB ? -1 : paddedA > paddedB ? 1 : 0;
}

export { required as parseMembershipIdentifier, instant as parseMembershipInstant };

/**
 * @param {{tenantId:string, memberId:string, subscriptionId:string}} scope
 * @param {Array<object>} events Already authenticated, provider-verified events.
 * @param {string} asOf Explicit ISO timestamp for deterministic expiry decisions.
 */
export function projectMembershipEntitlement(scope, events, asOf) {
  assertPlainMembershipRecord(scope, 'scope', ['tenantId', 'memberId', 'subscriptionId']);
  // Scope is a server-authenticated identity tuple, not a place for privilege,
  // entitlement, or billing assertions. Reject extra claims even when no
  // provider events are present, matching the test webhook admission policy.
  const scopeFields = new Set(['tenantId', 'memberId', 'subscriptionId']);
  if (Object.keys(scope).some(field => !scopeFields.has(field))) {
    throw new Error('unexpected membership scope claim');
  }
  const tenantId = required(scope.tenantId, 'tenantId');
  const memberId = required(scope.memberId, 'memberId');
  const subscriptionId = required(scope.subscriptionId, 'subscriptionId');
  instant(asOf, 'asOf');
  if (!Array.isArray(events)) throw new TypeError('events must be an array');

  const seen = new Map();
  const settlements = new Map();
  const settledInvoices = new Map();
  const normalized = [];
  for (const event of events) {
    assertPlainMembershipRecord(event, 'membership event', [
      'id', 'type', 'tenantId', 'memberId', 'subscriptionId', 'occurredAt', 'verified',
    ]);
    const id = required(event.id, 'event.id');
    if (event.tenantId !== tenantId || event.memberId !== memberId || event.subscriptionId !== subscriptionId) {
      throw new Error('membership event scope mismatch');
    }
    if (event.verified !== true) {
      throw new Error('unverified membership event');
    }
    if (!TYPES.has(event.type)) throw new Error('unsupported membership event type');
    // Reject unexpected provider/client claims rather than silently discarding
    // them from the normalized event fingerprint. A duplicate event ID with
    // conflicting extra fields must never appear equivalent after projection.
    // This is defense in depth; verified:true still requires a trusted adapter.
    const commonFields = ['id', 'type', 'tenantId', 'memberId',
      'subscriptionId', 'occurredAt', 'verified'];
    const paymentFields = event.type.startsWith('payment_') ? ['invoiceId'] : [];
    const settlementFields = event.type === 'payment_succeeded'
      ? ['settlementId', 'periodEnd'] : [];
    const allowedFields = new Set([...commonFields, ...paymentFields, ...settlementFields]);
    if (Object.keys(event).some(field => !allowedFields.has(field))) {
      throw new Error('unexpected membership event claim');
    }
    instant(event.occurredAt, 'event.occurredAt');
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
      if (compareMembershipInstants(normalizedEvent.periodEnd, event.occurredAt) <= 0) {
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
    normalized.push(normalizedEvent);
  }

  normalized.sort((a, b) => compareMembershipInstants(a.occurredAt, b.occurredAt) || ORDER[a.type] - ORDER[b.type] || a.id.localeCompare(b.id));
  // Provider events may arrive out of order. A refund invalidates the invoice's
  // settlement even when its recorded timestamp precedes the success event.
  // Only refunds effective at asOf participate in historical projections.
  const refundedInvoices = new Set(normalized
    .filter((event) => event.type === 'payment_refunded' && compareMembershipInstants(event.occurredAt, asOf) <= 0)
    .map((event) => event.invoiceId));
  let status = 'pending';
  let periodEnd = null;
  // Only a refund of the currently effective paid invoice may revoke it.
  // Delayed refunds for older invoices must not undo a distinct later payment.
  let activeInvoiceId = null;
  // Track settled invoices in event-time order. A delayed failure for an
  // earlier paid invoice cannot revoke a newer, independently paid period.
  const previouslyPaidInvoices = new Set();
  let lastEventId = null;
  let processedEvents = 0;
  for (const event of normalized) {
    if (compareMembershipInstants(event.occurredAt, asOf) > 0) continue;
    processedEvents += 1;
    lastEventId = event.id;
    if (status === 'cancelled') continue; // cancellation is terminal for this subscription ID
    switch (event.type) {
      case 'subscription_created':
        break; // never grants access, even if replayed after a payment
      case 'payment_succeeded':
        previouslyPaidInvoices.add(event.invoiceId);
        if (refundedInvoices.has(event.invoiceId)) {
          // A replayed/out-of-order success for a refunded invoice cannot
          // reactivate access. A distinct later paid invoice may still do so.
          if (status !== 'active') status = 'past_due';
          break;
        }
        // A newer invoice must not silently shorten an independently verified
        // paid-through period. Reject conflicting provider periods rather than
        // replacing a longer entitlement with an earlier expiration.
        if (status === 'active' && compareMembershipInstants(event.periodEnd, periodEnd) < 0) {
          throw new Error('payment period regresses existing entitlement');
        }
        status = 'active';
        periodEnd = event.periodEnd;
        activeInvoiceId = event.invoiceId;
        break;
      case 'payment_failed':
        // A failure for an already superseded paid invoice is historical;
        // it cannot undo an independent, newer settled invoice. A failure
        // for the active invoice or an unsettled renewal still fails closed.
        if (status === 'active' && event.invoiceId !== activeInvoiceId &&
            previouslyPaidInvoices.has(event.invoiceId)) break;
        status = 'past_due';
        break;
      case 'payment_refunded':
        if (status !== 'active' || event.invoiceId === activeInvoiceId) {
          status = 'past_due';
        }
        break;
      case 'subscription_cancelled':
        status = 'cancelled';
        break;
    }
  }
  if (status === 'active' && compareMembershipInstants(periodEnd, asOf) <= 0) {
    status = 'expired';
  }
  return Object.freeze({
    tenantId, memberId, subscriptionId, status,
    entitled: status === 'active', periodEnd, lastEventId, processedEvents,
  });
}
