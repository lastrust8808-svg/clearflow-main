/**
 * Pure trustee-signing eligibility check against a supplied governance snapshot.
 * This is NOT authentication, evidence of identity/signature, proof of trustee
 * authority, or a legal opinion. The caller must authenticate the tenant,
 * authorize access to the trust, and verify the instrument and appointments.
 * No records, signatures, payments, or notices are created by this function.
 *
 * Dates are calendar dates (YYYY-MM-DD). `revokedOn` is exclusive: an
 * appointment is inactive on and after that date. `acceptedOn` is mandatory
 * for an appointment to become active. Only independent and unanimous-joint
 * policies are supported; quorum, successor priorities and delegated powers
 * require separate reviewed rules and must not be inferred.
 */
// Governance data is a policy input, not an authorization token. Never read
// inherited trustee identities, accessor-produced dates, hidden properties or
// extra claims of signing authority from a supplied record.
const SNAPSHOT_FIELDS = new Set([
  'tenantId', 'entityId', 'trustId', 'asOfDate', 'mode', 'appointments', 'signerIds',
]);
const APPOINTMENT_FIELDS = new Set([
  'trusteeId', 'tenantId', 'entityId', 'trustId', 'effectiveOn',
  'acceptedOn', 'acceptanceEvidenceRef', 'revokedOn', 'revocationEvidenceRef',
]);
const APPOINTMENT_REQUIRED_FIELDS = new Set([
  'trusteeId', 'tenantId', 'entityId', 'trustId', 'effectiveOn',
]);

function requirePlainGovernanceRecord(record, allowed, required, label) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError(label + ' must be a plain data record');
  }
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(label + ' must be a plain data record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(record);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new TypeError('Unsupported ' + label + ' field');
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(label + ' fields must be enumerable data properties');
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(descriptors, key)) {
      throw new TypeError(label + '.' + key + ' must be an own data field');
    }
  }
}

// Reject sparse or accessor-backed lists before any array element is read.
// Otherwise a supplied trustee/signer list could execute getters or hide
// additional claims in symbol and non-index properties.
function requirePlainGovernanceList(list, label) {
  if (!Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype) {
    throw new TypeError(label + ' must be a plain array');
  }
  const descriptors = Object.getOwnPropertyDescriptors(list);
  const length = descriptors.length.value;
  let indexed = 0;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === 'length') continue;
    const index = typeof key === 'string' ? Number(key) : NaN;
    if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
      throw new TypeError(label + ' must contain only array indices');
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(label + ' must contain enumerable data elements');
    }
    indexed++;
  }
  if (indexed !== length) throw new TypeError(label + ' must not contain holes');
}

function id(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${field} must be a nonempty unpadded string`);
  }
  // Scope, appointment and signer identifiers must not contain invisible
  // control bytes that could alias audit records or signing-policy subjects.
  // This is structural validation, not identity or trustee authentication.
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError(`${field} must not contain control characters`);
  }
  return value;
}

function calendarDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${field} must be a YYYY-MM-DD calendar date`);
  }
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 ||
      day > new Date(Date.UTC(year, month, 0)).getUTCDate()) {
    throw new RangeError(`${field} is not a valid calendar date`);
  }
  return value;
}

/**
 * @param {{tenantId:string, entityId:string, trustId:string,
 *   asOfDate:string, mode:'independent'|'joint', signerIds:string[],
 *   appointments:Array<{trusteeId:string,tenantId:string,entityId:string,
 *     trustId:string,effectiveOn:string,acceptedOn?:string,acceptanceEvidenceRef?:string,revokedOn?:string,revocationEvidenceRef?:string}>}} snapshot
 * @returns {{eligible:boolean,reason:string,activeTrusteeCount:number,
 *   signerCount:number}} Frozen policy assessment, not an authorization token.
 */
export function evaluateTrusteeSigningPolicy(snapshot) {
  requirePlainGovernanceRecord(snapshot, SNAPSHOT_FIELDS, SNAPSHOT_FIELDS, 'Governance snapshot');
  const tenantId = id(snapshot.tenantId, 'tenantId');
  const entityId = id(snapshot.entityId, 'entityId');
  const trustId = id(snapshot.trustId, 'trustId');
  const asOfDate = calendarDate(snapshot.asOfDate, 'asOfDate');
  if (snapshot.mode !== 'independent' && snapshot.mode !== 'joint') {
    throw new TypeError('Unsupported trustee signing mode');
  }
  if (!Array.isArray(snapshot.appointments) || !Array.isArray(snapshot.signerIds)) {
    throw new TypeError('appointments and signerIds must be arrays');
  }
  requirePlainGovernanceList(snapshot.appointments, 'appointments');
  requirePlainGovernanceList(snapshot.signerIds, 'signerIds');
  const trustees = new Set();
  const active = new Set();
  // A date alone cannot stand in for a distinct acceptance record. The caller
  // must independently authenticate and authorize every referenced record.
  const acceptanceEvidenceRefs = new Set();
  // Every acceptance and revocation must have separate provenance, including
  // across trustees. References are structural only until verified by storage.
  const governanceEvidenceRefs = new Set();
  for (const appointment of snapshot.appointments) {
    requirePlainGovernanceRecord(appointment, APPOINTMENT_FIELDS,
      APPOINTMENT_REQUIRED_FIELDS, 'Trustee appointment');
    const trusteeId = id(appointment.trusteeId, 'appointment.trusteeId');
    if (trustees.has(trusteeId)) throw new Error('Duplicate trustee appointment');
    trustees.add(trusteeId);
    if (appointment.tenantId !== tenantId || appointment.entityId !== entityId ||
        appointment.trustId !== trustId) {
      throw new Error('Trustee appointment tenant/entity/trust mismatch');
    }
    const effectiveOn = calendarDate(appointment.effectiveOn, 'appointment.effectiveOn');
    const acceptedOn = appointment.acceptedOn == null ? null :
      calendarDate(appointment.acceptedOn, 'appointment.acceptedOn');
    const revokedOn = appointment.revokedOn == null ? null :
      calendarDate(appointment.revokedOn, 'appointment.revokedOn');
    if (acceptedOn !== null) {
      const acceptanceEvidenceRef = id(appointment.acceptanceEvidenceRef, 'appointment.acceptanceEvidenceRef');
      if (acceptanceEvidenceRefs.has(acceptanceEvidenceRef)) {
        throw new Error('Duplicate trustee acceptance evidence reference');
      }
      acceptanceEvidenceRefs.add(acceptanceEvidenceRef);
      if (governanceEvidenceRefs.has(acceptanceEvidenceRef)) {
        throw new Error('Reused trustee governance evidence reference');
      }
      governanceEvidenceRefs.add(acceptanceEvidenceRef);
    }
    if (revokedOn !== null) {
      const revocationEvidenceRef = id(appointment.revocationEvidenceRef, 'appointment.revocationEvidenceRef');
      if (governanceEvidenceRefs.has(revocationEvidenceRef)) {
        throw new Error('Reused trustee governance evidence reference');
      }
      governanceEvidenceRefs.add(revocationEvidenceRef);
    }
    if (revokedOn !== null && revokedOn < effectiveOn) {
      throw new RangeError('Revocation precedes appointment effective date');
    }
    // Revocation is exclusive. An appointment cannot be accepted on or after
    // its revocation date; otherwise a revoked trustee could be represented
    // as having subsequently accepted an authority that no longer exists.
    if (revokedOn !== null && acceptedOn !== null && acceptedOn >= revokedOn) {
      throw new RangeError('Trustee acceptance must precede revocation');
    }
    if (effectiveOn <= asOfDate && acceptedOn !== null && acceptedOn <= asOfDate &&
        (revokedOn === null || asOfDate < revokedOn)) {
      active.add(trusteeId);
    }
  }
  const signers = new Set();
  for (const signer of snapshot.signerIds) {
    const signerId = id(signer, 'signerIds item');
    if (signers.has(signerId)) throw new Error('Duplicate signer ID');
    signers.add(signerId);
  }
  const activeTrusteeCount = active.size;
  const signerCount = signers.size;
  const result = (eligible, reason) => Object.freeze({
    eligible, reason, activeTrusteeCount, signerCount,
  });
  if (activeTrusteeCount === 0) return result(false, 'no_active_accepted_trustees');
  if ([...signers].some(signer => !active.has(signer))) {
    return result(false, 'signer_not_active');
  }
  if (snapshot.mode === 'independent') {
    return signerCount === 1 ? result(true, 'eligible_under_supplied_policy') :
      result(false, 'independent_requires_one_active_signer');
  }
  return signerCount === activeTrusteeCount ? result(true, 'eligible_under_supplied_policy') :
    result(false, 'joint_requires_all_active_signers');
}
