/**
 * Pure replay of reserve-classification journal events. Append-only inputs
 * preserve historical asset additions/removals; removal is NOT a lien release,
 * settlement, transfer, or evidence of title. No writes or payments occur.
 *
 * The caller must authenticate scope, independently verify every evidenceRef,
 * supply asOfAt/maxEvidenceAgeMs from trusted policy, and durably persist the
 * ordered journal with transactional concurrency protection.
 */
import { createHash } from 'node:crypto';
import { calculateReserveCapacity } from './reserveCapacity.js';

const SCOPE_FIELDS = ['tenantId', 'entityId', 'trustId'];
const SNAPSHOT_FIELDS = new Set([...SCOPE_FIELDS, 'currency', 'asOfAt', 'maxEvidenceAgeMs', 'events']);
const COMMON_FIELDS = ['eventId', 'type', 'occurredAt', ...SCOPE_FIELDS, 'assetId', 'evidenceRef'];
const RECORDED_FIELDS = new Set([...COMMON_FIELDS, 'currency', 'kind', 'sourceType',
  'amountMinor', 'restrictedMinor', 'pledgedMinor']);
const REMOVED_FIELDS = new Set(COMMON_FIELDS);
const MAX_EVENTS = 10000;

function plainRecord(value, allowed, required, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(label + ' must be a plain data record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new TypeError('Unsupported ' + label + ' field');
    }
    if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) {
      throw new TypeError(label + ' fields must be enumerable data properties');
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(descriptors, key)) {
      throw new TypeError('Missing ' + label + ' field: ' + key);
    }
  }
  return descriptors;
}

function plainEvents(events) {
  if (!Array.isArray(events) || Object.getPrototypeOf(events) !== Array.prototype) {
    throw new TypeError('Reserve journal events must be a plain array');
  }
  const length = Object.getOwnPropertyDescriptor(events, 'length').value;
  if (length > MAX_EVENTS) throw new RangeError('Reserve journal exceeds maximum event count');
  const descriptors = Object.getOwnPropertyDescriptors(events);
  let count = 0;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === 'length') continue;
    const index = typeof key === 'string' ? Number(key) : NaN;
    if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key ||
        !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) {
      throw new TypeError('Reserve journal must contain only dense data elements');
    }
    count++;
  }
  if (count !== length) throw new TypeError('Reserve journal must not contain holes');
  // Snapshot validated descriptor values once; never re-read mutable indices.
  return Array.from({ length }, (_, index) => descriptors[String(index)].value);
}

function identifier(value, label) {
  if (typeof value !== 'string' || !value || value.length > 256 || value.trim() !== value || /\p{White_Space}/u.test(value) ||
      /[\u0000-\u001f\u007f-\u009f\p{Default_Ignorable_Code_Point}]/u.test(value) ||
      /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u.test(value) || value.normalize('NFC') !== value) {
    throw new TypeError(label + ' must be a canonical nonempty identifier');
  }
  // Unicode noncharacters are not portable external identity values. Match
  // private-note identifiers, including U+FFFE/U+FFFF on supplementary planes.
  for (const scalar of value) {
    const cp = scalar.codePointAt(0);
    if ((cp >= 0xFDD0 && cp <= 0xFDEF) || (cp & 0xFFFF) >= 0xFFFE) {
      throw new TypeError(label + ' must be a canonical nonempty identifier');
    }
  }
  return value;
}

function instant(value, label) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError(label + ' must be a canonical UTC timestamp');
  }
  return value;
}

// Canonical field order makes the digest stable across object insertion order.
// A digest is a comparison aid, NOT a trusted signature or proof of custody.
function canonicalJournalEvent(event) {
  const fields = event.type === 'asset_recorded' ?
    [...COMMON_FIELDS, 'currency', 'kind', 'sourceType', 'amountMinor',
      'restrictedMinor', 'pledgedMinor'] : COMMON_FIELDS;
  return Object.fromEntries(fields.filter(key => Object.hasOwn(event, key))
    .map(key => [key, event[key]]));
}

/**
 * Replays immutable asset_recorded / asset_removed classifications.
 * Returns a frozen reserve capacity projection, not a spendable balance.
 */
export function projectReserveJournal(snapshot) {
  const snapshotDescriptors = plainRecord(snapshot, SNAPSHOT_FIELDS, SNAPSHOT_FIELDS, 'Reserve journal snapshot');
  // Capture validated own data descriptors once; Proxy get traps must not
  // substitute valuation policy or journal contents after validation.
  snapshot = Object.fromEntries(Object.entries(snapshotDescriptors).map(
    ([key, descriptor]) => [key, descriptor.value]));
  const scope = Object.fromEntries(SCOPE_FIELDS.map(key => [key, identifier(snapshot[key], key)]));
  if (new Set(Object.values(scope)).size !== 3) {
    throw new Error('Reserve journal scope identifiers must be distinct');
  }
  // Reuse the canonical reserve classifier for snapshot policy admission.
  const base = { ...scope, currency: snapshot.currency, asOfAt: snapshot.asOfAt,
    maxEvidenceAgeMs: snapshot.maxEvidenceAgeMs };
  calculateReserveCapacity({ ...base, entries: [] });
  const journalEvents = plainEvents(snapshot.events);
  const active = new Map();
  const historicalAssets = new Set();
  const eventIds = new Set();
  const evidenceRefs = new Set();
  let previousAt = null;
  let removedAssetCount = 0;
  // Read validated dense slots directly; do not trust a mutable Array iterator.
  for (let eventIndex = 0; eventIndex < journalEvents.length; eventIndex++) {
    const rawEvent = journalEvents[eventIndex];
    const header = plainRecord(rawEvent, new Set([...RECORDED_FIELDS, ...REMOVED_FIELDS]),
      COMMON_FIELDS, 'Reserve journal event');
    // Snapshot descriptor values once: Proxy get traps must not change the
    // validated event during reserve replay or digest construction.
    const event = Object.fromEntries(Object.entries(header).map(([key, descriptor]) =>
      [key, descriptor.value]));
    journalEvents[eventIndex] = event;
    const type = header.type.value;
    if (type !== 'asset_recorded' && type !== 'asset_removed') {
      throw new TypeError('Unsupported reserve journal event type');
    }
    plainRecord(event, type === 'asset_recorded' ? RECORDED_FIELDS : REMOVED_FIELDS,
      type === 'asset_recorded' ?
        [...COMMON_FIELDS, 'currency', 'kind', 'sourceType', 'amountMinor'] :
        COMMON_FIELDS, 'Reserve journal event');
    const eventId = identifier(event.eventId, 'eventId');
    const assetId = identifier(event.assetId, 'assetId');
    const evidenceRef = identifier(event.evidenceRef, 'evidenceRef');
    if (eventIds.has(eventId)) throw new Error('Duplicate reserve journal event ID');
    if (evidenceRefs.has(evidenceRef)) throw new Error('Reused reserve journal evidence reference');
    eventIds.add(eventId);
    evidenceRefs.add(evidenceRef);
    for (const key of SCOPE_FIELDS) {
      if (event[key] !== scope[key]) throw new Error('Reserve journal scope mismatch');
    }
    const occurredAt = instant(event.occurredAt, 'occurredAt');
    if (occurredAt > snapshot.asOfAt) throw new Error('Reserve journal event occurs after as-of time');
    if (previousAt !== null && occurredAt <= previousAt) {
      throw new Error('Reserve journal timestamps must strictly increase');
    }
    previousAt = occurredAt;
    if (type === 'asset_recorded') {
      if (historicalAssets.has(assetId)) {
        throw new Error('Reserve asset cannot be recorded more than once');
      }
      historicalAssets.add(assetId);
      const entry = { id: eventId, assetId, evidenceRef, observedAt: occurredAt,
        ...scope, currency: event.currency, kind: event.kind, sourceType: event.sourceType,
        amountMinor: event.amountMinor };
      if (Object.hasOwn(event, 'restrictedMinor')) entry.restrictedMinor = event.restrictedMinor;
      if (Object.hasOwn(event, 'pledgedMinor')) entry.pledgedMinor = event.pledgedMinor;
      // Every historical record must be valid even if a later event removes it.
      calculateReserveCapacity({ ...base, asOfAt: occurredAt, maxEvidenceAgeMs: 0,
        entries: [entry] });
      active.set(assetId, entry);
    } else {
      if (!active.has(assetId)) {
        throw new Error('Reserve removal requires a currently recorded asset');
      }
      active.delete(assetId);
      removedAssetCount++;
    }
  }
  const scopes = new Set(Object.values(scope));
  for (const value of eventIds) {
    if (scopes.has(value) || historicalAssets.has(value) || evidenceRefs.has(value)) {
      throw new Error('Reserve journal identity namespaces must be distinct');
    }
  }
  for (const value of evidenceRefs) {
    if (scopes.has(value) || historicalAssets.has(value)) {
      throw new Error('Reserve journal identity namespaces must be distinct');
    }
  }
  for (const value of historicalAssets) {
    if (scopes.has(value)) throw new Error('Reserve journal identity namespaces must be distinct');
  }
  const capacity = calculateReserveCapacity({ ...base, entries: [...active.values()] });
  // Fingerprint the validated journal history, not the as-of valuation policy.
  // Store/compare this against an independently authenticated checkpoint;
  // hashing attacker-controlled data alone does not establish append-only storage.
  const canonicalEvents = [];
  for (let eventIndex = 0; eventIndex < journalEvents.length; eventIndex++) {
    canonicalEvents.push(canonicalJournalEvent(journalEvents[eventIndex]));
  }
  const journalSha256 = createHash('sha256').update(JSON.stringify({
    format: 'clearflow-reserve-journal-v1', ...scope, currency: snapshot.currency,
    events: canonicalEvents,
  })).digest('hex');
  // Unlike the history-only fingerprint, this checkpoint binds the evaluated
  // as-of instant and evidence freshness policy. A caller must obtain the
  // expected digest from separately authenticated durable storage.
  const checkpointSha256 = createHash('sha256').update(JSON.stringify({
    format: 'clearflow-reserve-checkpoint-v1', journalSha256,
    asOfAt: snapshot.asOfAt, maxEvidenceAgeMs: snapshot.maxEvidenceAgeMs,
  })).digest('hex');
  return Object.freeze({ ...capacity, journalSha256, checkpointSha256,
    journalEventCount: eventIds.size, activeAssetCount: active.size, removedAssetCount });
}


/**
 * Validate a proposed journal extension against a separately authenticated
 * predecessor checkpoint. This is a pure preflight gate: it neither persists
 * the new journal nor makes an untrusted checkpoint authoritative.
 *
 * The expected digest binds the predecessor history, as-of instant and policy.
 * The caller must obtain expectedPreviousSha256 from trusted durable storage,
 * authorize both scopes, and atomically compare-and-swap the stored checkpoint
 * before committing any append. A caller-supplied digest alone is insufficient.
 */
export function verifyReserveJournalAppend(previousSnapshot, nextSnapshot, expectedPreviousSha256) {
  if (typeof expectedPreviousSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(expectedPreviousSha256)) {
    throw new TypeError('Expected reserve checkpoint must be a lowercase SHA-256 digest');
  }
  // Snapshot own data descriptors before replay and append comparisons.
  // Proxy get traps must not substitute scope, policy, or event arrays after
  // the independently validated replay has accepted them.
  const stableSnapshot = raw => {
    const descriptors = plainRecord(raw, SNAPSHOT_FIELDS, SNAPSHOT_FIELDS,
      'Reserve journal snapshot');
    return Object.fromEntries(Object.entries(descriptors).map(
      ([key, descriptor]) => [key, descriptor.value]));
  };
  previousSnapshot = stableSnapshot(previousSnapshot);
  nextSnapshot = stableSnapshot(nextSnapshot);
  // Full replay validates every historical and proposed event before any
  // comparison. The previous snapshot must independently pass its own policy.
  const previous = projectReserveJournal(previousSnapshot);
  const next = projectReserveJournal(nextSnapshot);
  if (previous.checkpointSha256 !== expectedPreviousSha256) {
    throw new Error('Reserve journal predecessor checkpoint mismatch');
  }
  for (const field of [...SCOPE_FIELDS, 'currency']) {
    if (previousSnapshot[field] !== nextSnapshot[field]) {
      throw new Error('Reserve journal append cannot change owner scope or currency');
    }
  }
  if (nextSnapshot.asOfAt < previousSnapshot.asOfAt) {
    throw new Error('Reserve journal append cannot roll back as-of time');
  }
  // A journal append is not a policy-change authorization. In particular,
  // widening the evidence age window could resurrect otherwise stale cash.
  // Require a separately authorized policy migration for any policy change.
  if (nextSnapshot.maxEvidenceAgeMs !== previousSnapshot.maxEvidenceAgeMs) {
    throw new Error('Reserve journal append cannot change evidence freshness policy');
  }
  if (nextSnapshot.events.length <= previousSnapshot.events.length) {
    throw new Error('Reserve journal append requires at least one new event');
  }
  // Replaying valid event sets alone cannot detect a rewritten historical
  // prefix. Compare canonical event bytes so key insertion order is irrelevant.
  // Compare the same descriptor-backed event slots used by replay. Indexed
  // Proxy reads may otherwise substitute a different historical prefix.
  const previousEvents = plainEvents(previousSnapshot.events);
  const nextEvents = plainEvents(nextSnapshot.events);
  for (let i = 0; i < previousEvents.length; i++) {
    // Replay validates descriptor-backed values; prefix comparison must use
    // those same values rather than invoking adversarial Proxy get traps.
    const stableEvent = raw => {
      const descriptors = plainRecord(raw, RECORDED_FIELDS, COMMON_FIELDS,
        'Reserve journal event');
      const values = Object.fromEntries(Object.entries(descriptors).map(
        ([key, descriptor]) => [key, descriptor.value]));
      return canonicalJournalEvent(values);
    };
    if (JSON.stringify(stableEvent(previousEvents[i])) !==
        JSON.stringify(stableEvent(nextEvents[i]))) {
      throw new Error('Reserve journal append cannot rewrite historical events');
    }
  }
  return next;
}
