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

function requiredId(value, field) {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw new TypeError(field + ' must be a nonempty unpadded string');
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
 *   events:Array<{eventId:string,tenantId:string,entityId:string,
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
  const seen = new Set();
  let status = 'draft';
  let lastEventId = null;
  let lastEventAt = null;
  let issuedDocumentRef = null;
  let issuedEvidenceRef = null;
  const noticeDocumentRefs = new Set();
  const noticeEvidenceRefs = new Set();
  for (const event of snapshot.events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new TypeError('Invalid private note event');
    }
    const eventId = requiredId(event.eventId, 'eventId');
    if (seen.has(eventId)) throw new Error('Duplicate private note event ID');
    seen.add(eventId);
    for (const [key, value] of Object.entries(scope)) {
      if (event[key] !== value) throw new Error('Private note event ' + key + ' scope mismatch');
    }
    requiredId(event.actorId, 'actorId');
    const occurredAt = utcInstant(event.occurredAt, 'occurredAt');
    if (lastEventAt !== null && occurredAt <= lastEventAt) {
      throw new Error('Private note events must have strictly increasing timestamps');
    }
    const next = Object.hasOwn(NEXT[status], event.type) ? NEXT[status][event.type] : null;
    if (next === null) throw new Error('Invalid private note lifecycle transition');
    if (event.type === 'issued') {
      issuedDocumentRef = requiredId(event.documentRef, 'documentRef');
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
      // A new or revised draft must have its own preparation record; a reused
      // pointer would make two different draft versions appear to share one
      // provenance event. This does not authenticate the evidence itself.
      const noticeEvidenceRef = requiredId(event.evidenceRef, 'evidenceRef');
      if (noticeEvidenceRefs.has(noticeEvidenceRef)) {
        throw new Error('Notice draft preparation evidence reference must be unique');
      }
      noticeDocumentRefs.add(noticeDocumentRef);
      noticeEvidenceRefs.add(noticeEvidenceRef);
    }
    if (event.type === 'disputed') {
      requiredId(event.evidenceRef, 'evidenceRef');
    }
    status = next;
    lastEventId = eventId;
    lastEventAt = occurredAt;
  }
  return Object.freeze({ status, eventCount: seen.size, lastEventId, lastEventAt });
}
