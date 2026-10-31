/**
 * Pure projection of a private-note document/enforcement timeline.
 * The caller must authenticate the tenant/entity/trust, verify each event's
 * provenance and document evidence, and store events in an immutable,
 * transactional, tenant-scoped journal. This module neither authenticates
 * actors nor issues notes, serves notices, posts payments, determines legal
 * default, or confirms settlement.
 *
 * 'notice_prepared' means a DRAFT exists for human review, never that a notice
 * was sent, received, effective, or legally sufficient.
 */
const NEXT = Object.freeze({
  draft: Object.freeze({ issued: 'issued' }),
  issued: Object.freeze({ presented: 'presented' }),
  presented: Object.freeze({ disputed: 'disputed', notice_prepared: 'notice_prepared' }),
  disputed: Object.freeze({ notice_prepared: 'notice_prepared' }),
  notice_prepared: Object.freeze({ disputed: 'disputed' }),
});

// Only these structural fields may appear in a lifecycle event. In particular,
// a draft event must not smuggle delivery, default, settlement or payment
// assertions into a document-only projection. New event types require an
// explicit reviewed schema change, not silently ignored metadata.
const EVENT_FIELDS = new Set([
  'eventId', 'tenantId', 'entityId', 'trustId', 'noteId',
  'type', 'occurredAt', 'actorId', 'documentRef', 'evidenceRef',
]);

function requiredId(value, field) {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw new TypeError(field + ' must be a nonempty unpadded string');
  }
  // Match the storage-identifier control-character boundary in Security PR #23.
  // Invisible control bytes must not be accepted as event, actor, or evidence IDs.
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError(field + ' must not contain control characters');
  }
  return value;
}

function utcInstant(value, field) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value) {
    throw new TypeError(field + ' must be a canonical UTC ISO timestamp');
  }
  return value;
}

/**
 * @param {{tenantId:string,entityId:string,trustId:string,noteId:string,
 *   asOfAt:string,events:Array<{eventId:string,tenantId:string,entityId:string,
 *   trustId:string,noteId:string,type:string,occurredAt:string,actorId:string,
 *   documentRef?:string,evidenceRef?:string}>}} snapshot
 * @returns {{status:string,eventCount:number,lastEventId:string|null,
 *   lastEventAt:string|null}} Frozen non-authoritative projection.
 */
export function projectPrivateNoteLifecycle(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('Private note snapshot required');
  }
  const scope = {
    tenantId: requiredId(snapshot.tenantId, 'tenantId'),
    entityId: requiredId(snapshot.entityId, 'entityId'),
    trustId: requiredId(snapshot.trustId, 'trustId'),
    noteId: requiredId(snapshot.noteId, 'noteId'),
  };
  if (!Array.isArray(snapshot.events)) throw new TypeError('events must be an array');
  // Snapshot time is supplied by the caller; runtime integration must use a
  // trusted server-side clock, not an untrusted request parameter.
  const asOfAt = utcInstant(snapshot.asOfAt, 'asOfAt');
  const seen = new Set();
  // Actor identifiers name principals, not independent event/document/evidence
  // receipts. Reject role collisions anywhere in the supplied journal history.
  const actorIds = new Set();
  let status = 'draft';
  let lastEventId = null;
  let lastEventAt = null;
  let issuedDocumentRef = null;
  let issuedEvidenceRef = null;
  const noticeDocumentRefs = new Set();
  let latestNoticeDocumentRef = null;
  const noticeEvidenceRefs = new Set();
  // Distinguish immutable document identities from action-provenance receipts.
  // Even a later notice document must not reuse an earlier evidence pointer.
  const documentRefs = new Set();
  // Evidence references identify distinct lifecycle-action provenance records.
  // Reusing a pointer for a different action must fail closed; verification
  // of the referenced record remains the caller's responsibility.
  const lifecycleEvidenceRefs = new Set();
  for (const event of snapshot.events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new TypeError('Invalid private note event');
    }
    // Require a plain, own-property data record. Inherited fields, getters and
    // hidden properties must not supply purported actor, scope or legal claims.
    // This is structural admission only; authentication is the caller's duty.
    const prototype = Object.getPrototypeOf(event);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Private note lifecycle event must be a plain data record');
    }
    const descriptors = Object.getOwnPropertyDescriptors(event);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError('Private note lifecycle event fields must be enumerable data properties');
      }
      if (typeof key !== 'string' ||
          (!EVENT_FIELDS.has(key) &&
           !(Object.hasOwn(descriptors, 'type') &&
             descriptors.type.value === 'notice_prepared' &&
             key === 'supersedesDocumentRef'))) {
        throw new TypeError('Unsupported private note lifecycle event field');
      }
    }
    // All currently supported event types require the same core identifiers,
    // including document and evidence refs. Never read them from a prototype.
    for (const key of EVENT_FIELDS) {
      if (!Object.hasOwn(descriptors, key)) {
        throw new TypeError('Missing own private note lifecycle event field: ' + key);
      }
    }
    const eventId = requiredId(event.eventId, 'eventId');
    if (seen.has(eventId)) throw new Error('Duplicate private note event ID');
    seen.add(eventId);
    for (const [key, value] of Object.entries(scope)) {
      if (event[key] !== value) throw new Error('Private note event ' + key + ' scope mismatch');
    }
    actorIds.add(requiredId(event.actorId, 'actorId'));
    const occurredAt = utcInstant(event.occurredAt, 'occurredAt');
    if (occurredAt > asOfAt) {
      throw new Error('Private note event occurs after snapshot as-of timestamp');
    }
    if (lastEventAt !== null && occurredAt <= lastEventAt) {
      throw new Error('Private note events must have strictly increasing timestamps');
    }
    const next = Object.hasOwn(NEXT[status], event.type) ? NEXT[status][event.type] : null;
    if (next === null) throw new Error('Invalid private note lifecycle transition');
    if (event.type === 'issued') {
      issuedDocumentRef = requiredId(event.documentRef, 'documentRef');
      documentRefs.add(issuedDocumentRef);
      // An issuance without a provenance reference must not become an issued state.
      // The caller must independently verify this evidence before accepting it.
      issuedEvidenceRef = requiredId(event.evidenceRef, 'evidenceRef');
    }
    if (event.type === 'presented') {
      const presentedDocumentRef = requiredId(event.documentRef, 'documentRef');
      if (presentedDocumentRef !== issuedDocumentRef) {
        throw new Error('Presented document must match the issued note document');
      }
      // Evidence of signing/issuance cannot also serve as evidence that the
      // instrument was subsequently presented. Authenticity remains a caller duty.
      const presentmentEvidenceRef = requiredId(event.evidenceRef, 'evidenceRef');
      if (presentmentEvidenceRef === issuedEvidenceRef) {
        throw new Error('Presentment evidence must be distinct from issuance evidence');
      }
    }
    if (event.type === 'notice_prepared') {
      const noticeDocumentRef = requiredId(event.documentRef, 'documentRef');
      if (noticeDocumentRef === issuedDocumentRef || noticeDocumentRefs.has(noticeDocumentRef)) {
        throw new Error('Notice draft document reference must be distinct and unique');
      }
      // Revised notices must explicitly identify the immediately preceding
      // draft. This is a document lineage check, not proof of service or legal
      // effectiveness. Initial drafts must not claim an earlier notice.
      const predecessorRef = Object.hasOwn(descriptors, 'supersedesDocumentRef')
        ? descriptors.supersedesDocumentRef.value : undefined;
      if (latestNoticeDocumentRef === null) {
        if (predecessorRef != null) {
          throw new Error('Initial notice draft cannot supersede another document');
        }
      } else {
        const supersedes = requiredId(predecessorRef, 'supersedesDocumentRef');
        if (supersedes !== latestNoticeDocumentRef) {
          throw new Error('Notice revision must supersede the latest prepared draft');
        }
      }
      // A new or revised draft must have its own preparation record; a reused
      // pointer would make two different draft versions appear to share one
      // provenance event. This does not authenticate the evidence itself.
      const noticeEvidenceRef = requiredId(event.evidenceRef, 'evidenceRef');
      if (noticeEvidenceRefs.has(noticeEvidenceRef)) {
        throw new Error('Notice draft preparation evidence reference must be unique');
      }
      noticeDocumentRefs.add(noticeDocumentRef);
      documentRefs.add(noticeDocumentRef);
      noticeEvidenceRefs.add(noticeEvidenceRef);
      latestNoticeDocumentRef = noticeDocumentRef;
    }
    if (event.type === 'disputed') {
      // A dispute must identify a document already registered in this note's
      // timeline. The disputed target may be the issued instrument or an
      // existing notice draft, but never an unrelated or future document.
      // This is reference integrity only, not evidence of actual delivery.
      const disputedDocumentRef = requiredId(event.documentRef, 'documentRef');
      if (disputedDocumentRef !== issuedDocumentRef && !noticeDocumentRefs.has(disputedDocumentRef)) {
        throw new Error('Dispute must reference the issued note or a previously prepared notice draft');
      }
      requiredId(event.evidenceRef, 'evidenceRef');
    }
    const lifecycleEvidenceRef = requiredId(event.evidenceRef, 'evidenceRef');
    if (lifecycleEvidenceRefs.has(lifecycleEvidenceRef)) {
      throw new Error('Private note lifecycle evidence reference must be unique across events');
    }
    lifecycleEvidenceRefs.add(lifecycleEvidenceRef);
    status = next;
    lastEventId = eventId;
    lastEventAt = occurredAt;
  }
  // A document reference must not be recycled as an issuance, presentment,
  // dispute or notice-preparation evidence receipt, regardless of event order.
  // The caller must still authenticate both reference namespaces in storage.
  for (const documentRef of documentRefs) {
    if (lifecycleEvidenceRefs.has(documentRef)) {
      throw new Error('Private note document and lifecycle evidence references must be distinct');
    }
  }
  // An event's journal identity must never double as a document identity or
  // independent evidence receipt, even when the collision occurs in a later
  // event. This is namespace integrity, not proof that the receipt is genuine.
  for (const eventId of seen) {
    if (documentRefs.has(eventId) || lifecycleEvidenceRefs.has(eventId)) {
      throw new Error('Private note event, document and evidence references must be distinct');
    }
  }
  // An actor identifier must never be interpreted as a journal event,
  // immutable document, or independent provenance receipt. Repeated actors
  // across legitimate actions are permitted; only cross-role reuse fails.
  for (const actorId of actorIds) {
    if (seen.has(actorId) || documentRefs.has(actorId) || lifecycleEvidenceRefs.has(actorId)) {
      throw new Error('Private note actor identifiers must be distinct from event, document and evidence references');
    }
  }
  return Object.freeze({ status, eventCount: seen.size, lastEventId, lastEventAt });
}
